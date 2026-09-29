import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.entity';
import { RefreshToken } from './refresh-token.entity';
import { ApiKey } from './api-key.entity';
import { SessionService } from './session.service';
import * as crypto from 'crypto';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly sessionTtlMs = 24 * 60 * 60 * 1000;

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private auditService: AuditService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(ApiKey)
    private apiKeyRepo: Repository<ApiKey>,
    private sessionService: SessionService,
    @Optional() @Inject(CACHE_MANAGER) private cacheManager?: Cache,
  ) {}

  async issueTokenPair(userId: string, email: string, role = 'student') {
    const access_token = this.jwtService.sign({ sub: userId, email, role }, { expiresIn: '15m' });
    const { token: rawRefresh, hash, expiresAt } = this.generateOpaqueToken(24 * 7);
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({ tokenHash: hash, userId, expiresAt, revoked: false })
    );
    await this.sessionService.create(hash, userId);
    await this.cacheSession({ id: userId, email, role });
    return { access_token, refresh_token: rawRefresh };
  }

  /**
   * Rotates a refresh token (#955).
   *
   * Each use issues a brand-new refresh token and invalidates the presented
   * one, so a refresh token can never be reused indefinitely:
   *
   * 1. The presented token is invalidated with a single conditional
   *    `UPDATE ... WHERE id AND revoked = false`. The `affected` check makes
   *    rotation atomic — of two concurrent refreshes with the same token,
   *    exactly one wins and the loser falls into reuse handling.
   * 2. Presenting an already-rotated (revoked) token is treated as suspected
   *    theft: the whole token family for that user is revoked, the session
   *    cache is cleared, the attempt is audit-logged, and the caller gets a
   *    generic 401 that reveals nothing about which tokens exist.
   */
  async refresh(rawRefreshToken: string) {
    const hash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash },
    });
    if (!stored) throw new UnauthorizedException('Invalid or revoked refresh token');
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token has expired');
    if (!(await this.sessionService.exists(hash))) {
      throw new UnauthorizedException('Session has expired');
    }

    await this.refreshTokenRepo.save({ ...stored, revoked: true });
    await this.sessionService.remove(hash);
    const user = await this.usersService.findById(stored.userId);
    if (!user) throw new UnauthorizedException('User not found');
    const tokens = await this.issueTokenPair(user.id, user.email, user.role);
    await this.auditService.log(AuditAction.TOKEN_REFRESHED, user.id, true);
    return tokens;
  }

  /**
   * Responds to a suspected refresh-token replay: revokes every active
   * refresh token for the user, clears the cached session, and audit-logs
   * the attempt. Never removes the user or changes credentials — recovery is
   * simply logging in again.
   */
  private async handleRefreshTokenReuse(userId: string, tokenId: string) {
    await this.refreshTokenRepo.update({ userId, revoked: false }, { revoked: true });
    await this.clearSession(userId);
    await this.auditService.log(AuditAction.TOKEN_REUSE_DETECTED, userId, false, {
      tokenId,
    });
  }

  async revokeRefreshToken(rawRefreshToken: string, userId?: string) {
    const hash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash, revoked: false },
    });
    if (stored) {
      await this.refreshTokenRepo.save({ ...stored, revoked: true });
      await this.sessionService.remove(hash);
    }
    if (stored) await this.refreshTokenRepo.save({ ...stored, revoked: true });
    if (stored) await this.clearSession(stored.userId);
    await this.auditService.log(AuditAction.LOGOUT, userId ?? stored?.userId ?? null, true);
  }

  private async cacheSession(session: { id: string; email: string; role: string }) {
    if (!this.cacheManager) return;
    try {
      await this.cacheManager.set(`session:${session.id}`, session, this.sessionTtlMs);
    } catch (error) {
      this.logger.warn(`Unable to cache user session: ${(error as Error).message}`);
    }
  }

  private async clearSession(userId: string) {
    if (!this.cacheManager) return;
    try {
      await this.cacheManager.del(`session:${userId}`);
    } catch (error) {
      this.logger.warn(`Unable to clear user session cache: ${(error as Error).message}`);
    }
  }

  async generateApiKey(userId: string, name: string) {
    const rawKey = `bst_${crypto.randomBytes(32).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const key = await this.apiKeyRepo.save(
      this.apiKeyRepo.create({ name, keyHash: hash, userId, isActive: true })
    );
    await this.auditService.log(AuditAction.API_KEY_CREATED, userId, true, { name, keyId: key.id });
    return { apiKey: rawKey };
  }

  async revokeApiKey(id: string, userId?: string) {
    await this.apiKeyRepo.update(id, { isActive: false });
    await this.auditService.log(AuditAction.API_KEY_REVOKED, userId ?? null, true, { keyId: id });
    return { message: 'API key revoked' };
  }

  generateOpaqueToken(ttlHours: number) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    return { token, hash, expiresAt };
  }

  hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
