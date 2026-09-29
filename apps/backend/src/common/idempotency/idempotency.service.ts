import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/** Sentinel stored while the first request is still processing. */
export const IDEMPOTENCY_IN_FLIGHT = '__IN_FLIGHT__';

/** How long (in seconds) a key + its cached response are retained. */
export const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 h

export interface IdempotencyRecord {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private cacheKey(key: string): string {
    return `idempotency:${key}`;
  }

  /**
   * Attempt to reserve an idempotency key.
   * Returns:
   *   - `null`  → key is fresh, caller should proceed and then call `resolve()`
   *   - `IDEMPOTENCY_IN_FLIGHT` → a duplicate request arrived while the first is still running
   *   - `IdempotencyRecord`    → the cached response from a previously completed request
   */
  async check(key: string): Promise<IdempotencyRecord | typeof IDEMPOTENCY_IN_FLIGHT | null> {
    const existing = await this.cache.get<IdempotencyRecord | typeof IDEMPOTENCY_IN_FLIGHT>(
      this.cacheKey(key),
    );

    if (existing === undefined || existing === null) {
      // Reserve the key immediately so concurrent duplicates get IN_FLIGHT
      await this.cache.set(
        this.cacheKey(key),
        IDEMPOTENCY_IN_FLIGHT,
        IDEMPOTENCY_TTL_SECONDS * 1000, // cache-manager v5 uses ms; v4 uses seconds
      );
      return null;
    }

    return existing;
  }

  /**
   * Store the final response for a completed request so that retries can be
   * served the same result without re-executing the handler.
   */
  async resolve(key: string, record: IdempotencyRecord): Promise<void> {
    await this.cache.set(
      this.cacheKey(key),
      record,
      IDEMPOTENCY_TTL_SECONDS * 1000,
    );
  }

  /**
   * Remove a reserved key when the handler throws an unrecoverable error so
   * the client can retry with the same key after fixing their request.
   */
  async release(key: string): Promise<void> {
    await this.cache.del(this.cacheKey(key));
  }
}
