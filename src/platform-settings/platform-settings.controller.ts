import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PlatformSettingsService } from './platform-settings.service';

interface UpdateTimezoneDto {
  timezone: string;
}

@Controller()
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  /** Public — readable by the Next.js server for SSR timezone injection. */
  @Get('public/platform-settings')
  @Public()
  getConfig(): { timezone: string } {
    return this.service.getPlatformConfig();
  }

  /** Admin-only — updates the business timezone. */
  @Put('admin/platform-settings')
  @HttpCode(HttpStatus.OK)
  async update(@Body() body: UpdateTimezoneDto): Promise<{ timezone: string }> {
    await this.service.setTimezone(body.timezone);
    return this.service.getPlatformConfig();
  }
}
