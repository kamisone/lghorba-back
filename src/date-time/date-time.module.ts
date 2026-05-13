import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { DateTimeService } from './date-time.service';

@Module({
  imports: [PlatformSettingsModule],
  providers: [DateTimeService],
  exports: [DateTimeService],
})
export class DateTimeModule {}
