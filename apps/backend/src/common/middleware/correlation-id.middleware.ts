import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { requestContextStorage } from '../request-context';

export const CORRELATION_ID_HEADER = 'x-request-id';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[CORRELATION_ID_HEADER] as string | undefined;
    const id = incoming || randomUUID();
    req.correlationId = id;
    res.setHeader(CORRELATION_ID_HEADER, id);

    // Bind the rest of the request lifecycle to a context carrying the requestId
    // so that logger.service.ts can attach it automatically to every log entry.
    requestContextStorage.run({ requestId: id }, next);
  }
}
