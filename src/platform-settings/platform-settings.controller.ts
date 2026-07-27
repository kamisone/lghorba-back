import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  PlatformSettingsService,
  MetaPixelConfig,
} from './platform-settings.service';

interface UpdateTimezoneDto {
  timezone: string;
}

interface UpdateMetaPixelDto {
  pixelId: string | null;
  enabled: boolean;
}

@Controller()
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  /** Public — readable by the Next.js server for SSR timezone / pixel injection. */
  @Get('public/platform-settings')
  @Public()
  getConfig(): { timezone: string; metaPixel: MetaPixelConfig } {
    return this.service.getPlatformConfig();
  }

  /** Admin-only — updates the business timezone. */
  @Put('admin/platform-settings')
  @HttpCode(HttpStatus.OK)
  async update(
    @Body() body: UpdateTimezoneDto,
  ): Promise<{ timezone: string; metaPixel: MetaPixelConfig }> {
    await this.service.setTimezone(body.timezone);
    return this.service.getPlatformConfig();
  }

  /** Admin-only — updates the Meta Pixel ID / enabled flag. */
  @Put('admin/platform-settings/meta-pixel')
  @HttpCode(HttpStatus.OK)
  async updateMetaPixel(
    @Body() body: UpdateMetaPixelDto,
  ): Promise<{ timezone: string; metaPixel: MetaPixelConfig }> {
    await this.service.setMetaPixelConfig(body);
    return this.service.getPlatformConfig();
  }

  /** Admin-only — addresses excluded from shop analytics. */
  @Get('admin/platform-settings/analytics-excluded-ips')
  getAnalyticsExcludedIps(): { rules: string[] } {
    return { rules: this.service.getAnalyticsExcludedIps() };
  }

  /**
   * Admin-only — replaces the exclusion list. Echoes back anything unparseable
   * so the UI can tell the admin their entry did not take effect.
   */
  @Put('admin/platform-settings/analytics-excluded-ips')
  @HttpCode(HttpStatus.OK)
  async updateAnalyticsExcludedIps(
    @Body() body: { value: string },
  ): Promise<{ rules: string[]; invalid: string[] }> {
    return this.service.setAnalyticsExcludedIps(body?.value ?? '');
  }

  /** Admin-only — whether the Meta Conversions API access token is set server-side. Never returns the token itself. */
  @Get('admin/platform-settings/meta-capi-status')
  getCapiStatus(): { configured: boolean } {
    return { configured: !!process.env.META_CAPI_ACCESS_TOKEN };
  }
}
