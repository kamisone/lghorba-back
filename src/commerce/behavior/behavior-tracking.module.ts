import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopBehaviorEvent } from '../entities/shop-behavior-event.entity';
import { BehaviorTrackingService } from './behavior-tracking.service';
import { BehaviorTrackingController } from './behavior-tracking.controller';
import { GeoIpService } from './geo-ip.service';
import { PlatformSettingsModule } from '../../platform-settings/platform-settings.module';

// Standalone (no dependency on CommerceModule or MetaCapiModule) so both can
// import it — CommerceModule already imports MetaCapiModule, so exporting
// this service from CommerceModule itself would create a circular import.
@Module({
  imports: [TypeOrmModule.forFeature([ShopBehaviorEvent]), PlatformSettingsModule],
  controllers: [BehaviorTrackingController],
  providers: [BehaviorTrackingService, GeoIpService],
  exports: [BehaviorTrackingService, GeoIpService],
})
export class BehaviorTrackingModule {}
