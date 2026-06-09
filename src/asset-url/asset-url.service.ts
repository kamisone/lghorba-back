/**
 * AssetUrlService — canonical source of truth for all GCS signed URL resolution.
 *
 * Rules enforced here:
 *  - Only this service calls GcsService.signedUrl().
 *  - Domain services and controllers inject this service, never GcsService.signedUrl() directly.
 *  - Signed URLs are cached in Redis with a 13-minute TTL (2-minute safety buffer vs 15-minute GCS TTL).
 *  - Redis failure falls back to live generation so no request is broken by a cache outage.
 *  - Blog images use GcsService.publicUrl() and are NOT routed here — they're intentionally public.
 */

import { Injectable, Logger } from '@nestjs/common';
import { GcsService } from '../gcs/gcs.service';
import { RedisService } from '../redis/redis.service';

/** GCS V4 signed URL TTL, must stay in sync with gcs.service.ts. */
const GCS_TTL_MS     = 60 * 60 * 1_000;       // 1 hour
/** Redis cache TTL: GCS TTL minus 5-minute safety buffer. */
const CACHE_TTL_S    = 55 * 60;               // 3300 s — Redis SETEX ttl
/** Regenerate when remaining lifetime is below this threshold. */
const REFRESH_FLOOR_MS = 5 * 60 * 1_000;      // 5 min

const KEY_PREFIX = 'asset:surl:';

@Injectable()
export class AssetUrlService {
  private readonly logger = new Logger(AssetUrlService.name);

  constructor(
    private readonly gcs:   GcsService,
    private readonly redis: RedisService,
  ) {}

  // ── Core resolution ───────────────────────────────────────────────────────

  /** Resolve a single GCS object path → valid signed URL. Cached in Redis. */
  async resolve(objectPath: string): Promise<string> {
    const cached = await this.getCached(objectPath);
    if (cached) return cached;
    return this.sign(objectPath);
  }

  /**
   * Resolve multiple GCS object paths in one Redis round-trip.
   * Returns a Map<objectPath, signedUrl>.
   * Paths with cache misses are signed in a single parallel batch.
   */
  async resolveBatch(objectPaths: string[]): Promise<Map<string, string>> {
    if (!objectPaths.length) return new Map();

    const unique = [...new Set(objectPaths)];
    const keys   = unique.map(p => `${KEY_PREFIX}${p}`);
    const result = new Map<string, string>();

    // Batch Redis GET
    let raws: (string | null)[] = new Array(unique.length).fill(null);
    try {
      raws = await this.redis.client.mget(...keys);
    } catch (e) {
      this.logger.warn('Redis MGET failed, falling back to live signing', e);
    }

    const misses: string[] = [];
    for (let i = 0; i < unique.length; i++) {
      const cached = this.parseCacheValue(raws[i]);
      if (cached) {
        result.set(unique[i], cached);
      } else {
        misses.push(unique[i]);
      }
    }

    // Sign misses in parallel
    if (misses.length) {
      const signed = await Promise.all(misses.map(p => this.sign(p)));
      for (let i = 0; i < misses.length; i++) {
        result.set(misses[i], signed[i]);
      }
    }

    return result;
  }

  /** Immediately evict a cached URL — call on asset deletion or replacement. */
  async invalidate(objectPath: string): Promise<void> {
    try {
      await this.redis.client.del(`${KEY_PREFIX}${objectPath}`);
    } catch (e) {
      this.logger.warn(`Failed to invalidate cache for ${objectPath}`, e);
    }
  }

  /**
   * Evict all cached URLs whose paths start with a given prefix.
   * Use for bulk invalidation (e.g. all photos of a car after re-shoot).
   * Uses SCAN — safe for production Redis (no KEYS *).
   */
  async invalidatePrefix(prefix: string): Promise<void> {
    const pattern = `${KEY_PREFIX}${prefix}*`;
    try {
      await this.scanAndDelete(pattern);
    } catch (e) {
      this.logger.warn(`Failed to invalidate prefix ${prefix}`, e);
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async getCached(objectPath: string): Promise<string | null> {
    try {
      const raw = await this.redis.client.get(`${KEY_PREFIX}${objectPath}`);
      return this.parseCacheValue(raw);
    } catch {
      return null;
    }
  }

  private parseCacheValue(raw: string | null): string | null {
    if (!raw) return null;
    const sep = raw.lastIndexOf('|');
    if (sep === -1) return null;
    const expiresAt = Number(raw.slice(sep + 1));
    if (!expiresAt || expiresAt - Date.now() < REFRESH_FLOOR_MS) return null;
    return raw.slice(0, sep);
  }

  private async sign(objectPath: string): Promise<string> {
    const url       = await this.gcs.signedUrl(objectPath);
    const expiresAt = Date.now() + GCS_TTL_MS;
    const value     = `${url}|${expiresAt}`;
    try {
      await this.redis.client.setex(`${KEY_PREFIX}${objectPath}`, CACHE_TTL_S, value);
    } catch (e) {
      this.logger.warn(`Redis SETEX failed for ${objectPath} — URL served uncached`, e);
    }
    return url;
  }

  private async scanAndDelete(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await this.redis.client.del(...keys);
    } while (cursor !== '0');
  }
}
