import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PlatformSettings } from './platform-settings.entity';
import { ipMatchesAny, parseIpRules } from '../common/utils/ip-match.util';

const TIMEZONE_KEY = 'business_timezone';
const DEFAULT_TZ = 'Europe/Paris';
const META_PIXEL_ID_KEY = 'meta_pixel_id';
const META_PIXEL_ENABLED_KEY = 'meta_pixel_enabled';
const ANALYTICS_EXCLUDED_IPS_KEY = 'analytics_excluded_ips';
const CACHE_TTL_MS = 60_000; // refresh ceiling: 60 s

export interface MetaPixelConfig {
  pixelId: string | null;
  enabled: boolean;
}

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformSettingsService.name);

  private cachedTimezone: string = DEFAULT_TZ;
  private cachedMetaPixel: MetaPixelConfig = { pixelId: null, enabled: false };
  private cachedExcludedIps: string[] = [];
  private cacheExpiresAt: number = 0;

  constructor(
    @InjectRepository(PlatformSettings)
    private readonly repo: Repository<PlatformSettings>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.warmCache();
  }

  // ── Public read (synchronous, cached) ──────────────────────────────────────

  getTimezone(): string {
    this.refreshIfStale();
    return this.cachedTimezone;
  }

  getMetaPixelConfig(): MetaPixelConfig {
    this.refreshIfStale();
    return this.cachedMetaPixel;
  }

  /** Admin-configured addresses whose traffic is kept out of shop analytics. */
  getAnalyticsExcludedIps(): string[] {
    this.refreshIfStale();
    return this.cachedExcludedIps;
  }

  /**
   * Whether an address should be left out of analytics — staff browsing their
   * own shop would otherwise register as real demand.
   *
   * Reads from the 60 s cache, so this is safe on the hot event-write path.
   */
  isAnalyticsExcluded(ip: string | null | undefined): boolean {
    return ipMatchesAny(ip, this.getAnalyticsExcludedIps());
  }

  getPlatformConfig(): { timezone: string; metaPixel: MetaPixelConfig } {
    return {
      timezone: this.getTimezone(),
      metaPixel: this.getMetaPixelConfig(),
    };
  }

  // ── Public write ───────────────────────────────────────────────────────────

  async setTimezone(tz: string): Promise<void> {
    if (!isValidIANA(tz)) {
      throw new BadRequestException(
        `Invalid IANA timezone identifier: "${tz}"`,
      );
    }
    await this.repo.save(this.repo.create({ key: TIMEZONE_KEY, value: tz }));
    this.cachedTimezone = tz;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Business timezone updated to "${tz}"`);
  }

  async setMetaPixelConfig(input: {
    pixelId: string | null;
    enabled: boolean;
  }): Promise<void> {
    const pixelId = input.pixelId?.trim() || null;
    if (input.enabled && !isValidPixelId(pixelId)) {
      throw new BadRequestException(
        'A valid numeric Meta Pixel ID is required to enable it',
      );
    }
    await this.repo.save([
      this.repo.create({ key: META_PIXEL_ID_KEY, value: pixelId ?? '' }),
      this.repo.create({
        key: META_PIXEL_ENABLED_KEY,
        value: String(input.enabled),
      }),
    ]);
    this.cachedMetaPixel = { pixelId, enabled: input.enabled };
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Meta Pixel config updated (enabled=${input.enabled})`);
  }

  /**
   * Replaces the exclusion list. Returns the entries that could not be parsed so
   * the admin sees them rather than assuming a typo took effect.
   */
  async setAnalyticsExcludedIps(raw: string): Promise<{ rules: string[]; invalid: string[] }> {
    const { rules, invalid } = parseIpRules(raw ?? '');
    await this.repo.save(
      this.repo.create({ key: ANALYTICS_EXCLUDED_IPS_KEY, value: rules.join('\n') }),
    );
    this.cachedExcludedIps = rules;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Analytics IP exclusions updated (${rules.length} rule(s))`);
    return { rules, invalid };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private refreshIfStale(): void {
    if (Date.now() > this.cacheExpiresAt) {
      // Refresh in background; serve stale in the meantime
      this.warmCache().catch((err) =>
        this.logger.warn(
          `PlatformSettings cache refresh failed: ${(err as Error).message}`,
        ),
      );
    }
  }

  private async warmCache(): Promise<void> {
    try {
      const rows = await this.repo.find({
        where: {
          key: In([
            TIMEZONE_KEY,
            META_PIXEL_ID_KEY,
            META_PIXEL_ENABLED_KEY,
            ANALYTICS_EXCLUDED_IPS_KEY,
          ]),
        },
      });
      const byKey = new Map(rows.map((r) => [r.key, r.value]));

      this.cachedTimezone = byKey.get(TIMEZONE_KEY) ?? DEFAULT_TZ;
      this.cachedMetaPixel = {
        pixelId: byKey.get(META_PIXEL_ID_KEY) || null,
        enabled: byKey.get(META_PIXEL_ENABLED_KEY) === 'true',
      };
      this.cachedExcludedIps = (byKey.get(ANALYTICS_EXCLUDED_IPS_KEY) ?? '')
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    } catch (err) {
      this.logger.warn(
        `PlatformSettings warm cache failed: ${(err as Error).message}`,
      );
    }
  }
}

function isValidIANA(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidPixelId(pixelId: string | null): pixelId is string {
  return !!pixelId && /^\d{10,20}$/.test(pixelId);
}
