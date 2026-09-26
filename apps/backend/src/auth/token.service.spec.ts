import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { RefreshToken } from './refresh-token.entity';
import { ApiKey } from './api-key.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-log.entity';

describe('TokenService refresh rotation (#955)', () => {
  let service: TokenService;

  // In-memory stand-in for the refresh_tokens table so sequential refreshes
  // exercise the same state transitions as the real repository.
  type StoredRow = Pick<RefreshToken, 'id' | 'tokenHash' | 'userId' | 'expiresAt' | 'revoked'>;
  const rows = new Map<string, StoredRow>();
  let seq = 0;

  const matches = (row: StoredRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);

  const mockRefreshRepo = {
    create: jest.fn(
      (dto: Omit<StoredRow, 'id'>): StoredRow => ({
        id: `rt-${++seq}`,
        ...dto,
      })
    ),
    save: jest.fn(async (entity: StoredRow): Promise<StoredRow> => {
      rows.set(entity.id, { ...entity });
      return entity;
    }),
    findOne: jest.fn(
      async (opts: { where: Record<string, unknown> }): Promise<StoredRow | null> => {
        for (const row of rows.values()) {
          if (matches(row, opts.where)) return { ...row };
        }
        return null;
      }
    ),
    update: jest.fn(
      async (
        criteria: Record<string, unknown>,
        partial: Partial<StoredRow>
      ): Promise<{ affected: number }> => {
        let affected = 0;
        for (const [id, row] of rows) {
          if (matches(row, criteria)) {
            rows.set(id, { ...row, ...partial });
            affected += 1;
          }
        }
        return { affected };
      }
    ),
  };

  const mockApiKeyRepo = { save: jest.fn(), update: jest.fn() };

  let accessSeq = 0;
  const mockJwtService = {
    sign: jest.fn(() => `access-${++accessSeq}`),
  };

  const mockUsersService = {
    findById: jest.fn(async (id: string) => ({
      id,
      email: 'user@example.com',
      role: 'student',
    })),
  };

  const mockAuditService = { log: jest.fn() };

  const rowByHash = (hash: string) => [...rows.values()].find((r) => r.tokenHash === hash);

  beforeEach(async () => {
    rows.clear();
    seq = 0;
    accessSeq = 0;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshRepo },
        { provide: getRepositoryToken(ApiKey), useValue: mockApiKeyRepo },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  afterEach(() => jest.clearAllMocks());

  it('issues a new refresh token and invalidates the presented one', async () => {
    const first = await service.issueTokenPair('u-1', 'user@example.com');
    const rotated = await service.refresh(first.refresh_token);

    expect(rotated.refresh_token).not.toBe(first.refresh_token);
    expect(rotated.access_token).toBeDefined();

    // Old token row is revoked; new token row is active.
    expect(rowByHash(service.hashToken(first.refresh_token)).revoked).toBe(true);
    expect(rowByHash(service.hashToken(rotated.refresh_token)).revoked).toBe(false);

    expect(mockAuditService.log).toHaveBeenCalledWith(AuditAction.TOKEN_REFRESHED, 'u-1', true);
  });

  it('rejects reuse of an already-rotated token and revokes the token family', async () => {
    const first = await service.issueTokenPair('u-1', 'user@example.com');
    const rotated = await service.refresh(first.refresh_token);

    await expect(service.refresh(first.refresh_token)).rejects.toBeInstanceOf(
      UnauthorizedException
    );

    // Theft response: the still-valid rotated token is revoked too.
    expect(rowByHash(service.hashToken(rotated.refresh_token)).revoked).toBe(true);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      AuditAction.TOKEN_REUSE_DETECTED,
      'u-1',
      false,
      expect.objectContaining({ tokenId: expect.any(String) })
    );
  });

  it('treats a lost rotation race as reuse (conditional update affects 0 rows)', async () => {
    const first = await service.issueTokenPair('u-1', 'user@example.com');

    // Simulate a concurrent refresh winning first: the conditional
    // UPDATE ... WHERE revoked = false then affects no rows.
    mockRefreshRepo.update.mockResolvedValueOnce({ affected: 0 });

    await expect(service.refresh(first.refresh_token)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(mockAuditService.log).toHaveBeenCalledWith(
      AuditAction.TOKEN_REUSE_DETECTED,
      'u-1',
      false,
      expect.anything()
    );
  });

  it('rejects expired refresh tokens without issuing new ones', async () => {
    const pair = await service.issueTokenPair('u-1', 'user@example.com');
    const row = rowByHash(service.hashToken(pair.refresh_token));
    row.expiresAt = new Date(Date.now() - 1000);
    rows.set(row.id, row);

    await expect(service.refresh(pair.refresh_token)).rejects.toThrow('Refresh token has expired');
    expect(mockJwtService.sign).toHaveBeenCalledTimes(1); // issue only
  });

  it('rejects unknown refresh tokens', async () => {
    await expect(service.refresh('no-such-token')).rejects.toThrow(
      'Invalid or revoked refresh token'
    );
  });
});
