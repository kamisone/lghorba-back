import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PlatformSettings } from './platform-settings.entity';

const TIMEZONE_KEY = 'business_timezone';
const DEFAULT_TZ = 'Europe/Paris';
const META_PIXEL_ID_KEY = 'meta_pixel_id';
const META_PIXEL_ENABLED_KEY = 'meta_pixel_enabled';
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
          key: In([TIMEZONE_KEY, META_PIXEL_ID_KEY, META_PIXEL_ENABLED_KEY]),
        },
      });
      const byKey = new Map(rows.map((r) => [r.key, r.value]));

      this.cachedTimezone = byKey.get(TIMEZONE_KEY) ?? DEFAULT_TZ;
      this.cachedMetaPixel = {
        pixelId: byKey.get(META_PIXEL_ID_KEY) || null,
        enabled: byKey.get(META_PIXEL_ENABLED_KEY) === 'true',
      };
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
