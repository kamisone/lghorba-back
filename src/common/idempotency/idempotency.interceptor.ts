import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { RedisService } from '../../redis/redis.service';

/** Cache TTL for idempotency responses: 30 minutes. */
const IDEMPOTENCY_TTL_SEC = 1_800;

/**
 * Interceptor that implements idempotency for mutating endpoints.
 *
 * When a client sends `X-Idempotency-Key: <uuid>`, the response is
 * cached in Redis.  If the same key is seen again within 30 minutes
 * the cached response is returned immediately, making the operation
 * safe to retry after a network failure.
 *
 * Only applies to POST requests (apply selectively via @UseInterceptors).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly redis: RedisService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    // Only guard POST requests; let GETs/PATCHes pass through
    if (req.method !== 'POST') return next.handle();

    const rawKey = req.headers['x-idempotency-key'];
    const key    = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key || typeof key !== 'string' || key.length > 128) return next.handle();

    const cacheKey = `idempotency:${key}`;

    return from(this.redis.client.get(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached !== null) {
          // Reply was already committed for this key
          const { status, body } = JSON.parse(cached) as { status: number; body: unknown };
          res.status(status);
          res.setHeader('X-Idempotent-Replayed', 'true');
          this.logger.debug(`Idempotency cache hit: ${key}`);
          return of(body);
        }

        // First time — process the request, then cache the success response.
        // We do NOT cache errors: the client should be able to retry a failed call
        // with the same key until it succeeds.
        return next.handle().pipe(
          tap((body) => {
            const status = res.statusCode;
            if (status >= 200 && status < 300) {
              const payload = JSON.stringify({ status, body });
              this.redis.client
                .setex(cacheKey, IDEMPOTENCY_TTL_SEC, payload)
                .catch((e: Error) =>
                  this.logger.warn(`Failed to persist idempotency key ${key}: ${e?.message}`),
                );
            }
          }),
        );
      }),
    );
  }
}
