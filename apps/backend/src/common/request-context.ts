import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
}

/**
 * Application-wide AsyncLocalStorage store.
 * Populated by CorrelationIdMiddleware so every log call made within
 * a request handler automatically carries the X-Request-ID.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Returns the requestId for the currently active request, or undefined. */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
