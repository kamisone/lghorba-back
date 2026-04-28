import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';

// Atomically release the lock only if the caller still owns it.
// Without this, a slow request could delete a lock acquired by a
// different request after its own TTL expired.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface LockOptions {
  /** Maximum number of acquisition attempts (default: 4). */
  retries?: number;
  /** Base delay between retries in ms — doubles on each attempt (default: 80). */
  retryDelayMs?: number;
}

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Acquire a Redis lock, run `fn`, then release the lock.
   *
   * Uses SET NX PX (atomic) for acquisition and a Lua script for release
   * so the lock is never released by a requester that no longer owns it.
   *
   * @param key    Logical resource identifier (e.g. "booking:carId")
   * @param ttlMs  Lock TTL — must be longer than the critical section (default: 30 s)
   * @param fn     Work to perform while the lock is held
   */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    { retries = 4, retryDelayMs = 80 }: LockOptions = {},
  ): Promise<T> {
    const lockKey = `dlock:${key}`;
    const token   = randomUUID();

    let acquired = false;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.redis.client.set(lockKey, token, 'PX', ttlMs, 'NX');
        if (result === 'OK') { acquired = true; break; }
      } catch (redisErr) {
        this.logger.warn(`Redis lock SET failed on attempt ${attempt}: ${(redisErr as Error)?.message}`);
        // Redis I/O error — surface as service unavailable rather than a silent hang
        if (attempt === retries) {
          throw new ServiceUnavailableException(
            'Booking service temporarily unavailable — please retry in a moment',
          );
        }
      }

      if (attempt < retries) {
        // Jittered exponential back-off to reduce herd stampede
        const jitter = Math.random() * retryDelayMs;
        await sleep(retryDelayMs * 2 ** attempt + jitter);
      }
    }

    if (!acquired) {
      throw new ConflictException(
        'Another booking for this vehicle is being processed — please retry in a moment',
      );
    }

    try {
      return await fn();
    } finally {
      // Best-effort: even if this errors, the TTL will eventually expire the lock
      await this.redis.client
        .eval(RELEASE_SCRIPT, 1, lockKey, token)
        .catch((e: Error) => this.logger.warn(`Lock release failed: ${e?.message}`));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
