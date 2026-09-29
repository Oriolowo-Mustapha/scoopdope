import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * #958 – Missing CSRF protection on state-changing endpoints
 *
 * Validates CSRF tokens on state-changing requests (POST, PUT, PATCH, DELETE)
 * when browser session cookies are present.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (CSRF_SAFE_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    const hasBearer = req.headers.authorization?.startsWith('Bearer ');
    const csrfToken = req.headers[CSRF_HEADER] as string | undefined;

    // State-changing requests with session cookies must provide CSRF token unless authenticated via bearer token
    if (req.headers.cookie && !csrfToken && !hasBearer) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    next();
  }
}
