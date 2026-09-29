import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import {
  IdempotencyService,
  IdempotencyRecord,
  IDEMPOTENCY_IN_FLIGHT,
} from './idempotency.service';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Only apply idempotency to state-mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next.handle();
    }

    const rawKey = req.headers[IDEMPOTENCY_KEY_HEADER] as string | undefined;

    // No header supplied — pass through without idempotency protection
    if (!rawKey) {
      return next.handle();
    }

    // Validate key format (max 255 printable ASCII chars)
    if (rawKey.length > 255 || !/^[\x20-\x7E]+$/.test(rawKey)) {
      throw new BadRequestException(
        'Idempotency-Key must be 1–255 printable ASCII characters.',
      );
    }

    const existing = await this.idempotencyService.check(rawKey);

    if (existing === IDEMPOTENCY_IN_FLIGHT) {
      // Another identical request is still processing
      throw new ConflictException(
        'A request with this Idempotency-Key is already being processed. Please wait and retry.',
      );
    }

    if (existing !== null) {
      // We have a cached response — replay it without touching the handler
      const record = existing as IdempotencyRecord;
      this.logger.debug(`Replaying cached response for idempotency key: ${rawKey}`);

      Object.entries(record.headers).forEach(([name, value]) =>
        res.setHeader(name, value),
      );
      res.setHeader('X-Idempotent-Replayed', 'true');
      res.status(record.statusCode).json(record.body);
      // Return an empty observable — the response has already been written
      return new Observable((subscriber) => subscriber.complete());
    }

    // Key is fresh — run the handler and capture the response for future replays
    return next.handle().pipe(
      tap((body) => {
        const statusCode = res.statusCode || HttpStatus.CREATED;
        const record: IdempotencyRecord = {
          statusCode,
          headers: {
            'content-type': res.getHeader('content-type') as string ?? 'application/json',
          },
          body,
        };
        // Fire-and-forget: we don't need to await this to return the response
        this.idempotencyService.resolve(rawKey, record).catch((err) =>
          this.logger.error(`Failed to cache idempotency response for key ${rawKey}: ${err}`),
        );
      }),
      catchError((err) => {
        // Release the key so the client can retry after fixing the request
        this.idempotencyService.release(rawKey).catch((releaseErr) =>
          this.logger.error(`Failed to release idempotency key ${rawKey}: ${releaseErr}`),
        );
        return throwError(() => err);
      }),
    );
  }
}
