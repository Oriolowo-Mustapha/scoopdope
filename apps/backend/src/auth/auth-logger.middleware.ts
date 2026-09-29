import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { formatJwtPayloadForLog } from './jwt-payload-redactor';

/**
 * #959 – Sensitive data logged in auth middleware
 *
 * Middleware that safely logs JWT authorization tokens and decoded claims
 * without leaking user email or PII to application logs.
 */
@Injectable()
export class AuthLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuthMiddleware');

  use(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
          const payload = JSON.parse(payloadJson);
          const safeLog = formatJwtPayloadForLog(payload);
          this.logger.debug(
            `Auth token payload for ${req.method} ${req.originalUrl || req.url}: ${safeLog}`
          );
        }
      } catch {
        // Silently continue if decoding fails; guards handle malformed tokens
      }
    }
    next();
  }
}
