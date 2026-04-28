/** PostgreSQL error codes that are safe to retry. */
const RETRYABLE_PG_CODES = new Set([
  '40001', // serialization_failure  — SERIALIZABLE transaction conflict
  '40P01', // deadlock_detected      — two transactions deadlocked
]);

export function isTransientDbError(err: unknown): boolean {
  return RETRYABLE_PG_CODES.has((err as { code?: string })?.code ?? '');
}

/**
 * Retry `fn` up to `maxAttempts` times when `isRetryable` returns true.
 * Uses jittered exponential back-off to reduce thundering herds.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts  = 3,
    baseDelayMs  = 50,
    isRetryable  = isTransientDbError,
  }: {
    maxAttempts?: number;
    baseDelayMs?: number;
    isRetryable?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
