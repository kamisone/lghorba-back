import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSettings } from './platform-settings.entity';

const TIMEZONE_KEY = 'business_timezone';
const DEFAULT_TZ   = 'Europe/Paris';
const CACHE_TTL_MS = 60_000; // refresh ceiling: 60 s

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformSettingsService.name);

  private cachedTimezone: string = DEFAULT_TZ;
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
    if (Date.now() > this.cacheExpiresAt) {
      // Refresh in background; serve stale in the meantime
      this.warmCache().catch(err =>
        this.logger.warn(`PlatformSettings cache refresh failed: ${(err as Error).message}`),
      );
    }
    return this.cachedTimezone;
  }

  getPlatformConfig(): { timezone: string } {
    return { timezone: this.getTimezone() };
  }

  // ── Public write ───────────────────────────────────────────────────────────

  async setTimezone(tz: string): Promise<void> {
    if (!isValidIANA(tz)) {
      throw new BadRequestException(`Invalid IANA timezone identifier: "${tz}"`);
    }
    await this.repo.save(this.repo.create({ key: TIMEZONE_KEY, value: tz }));
    this.cachedTimezone  = tz;
    this.cacheExpiresAt  = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Business timezone updated to "${tz}"`);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async warmCache(): Promise<void> {
    try {
      const row = await this.repo.findOne({ where: { key: TIMEZONE_KEY } });
      this.cachedTimezone = row?.value ?? DEFAULT_TZ;
      this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    } catch (err) {
      this.logger.warn(`PlatformSettings warm cache failed: ${(err as Error).message}`);
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
