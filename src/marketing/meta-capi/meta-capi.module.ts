import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Order } from '../../commerce/entities/order.entity';
import { OrderItem } from '../../commerce/entities/order-item.entity';
import { DlqModule } from '../../dlq/dlq.module';
import { PlatformSettingsModule } from '../../platform-settings/platform-settings.module';
import { META_CAPI_QUEUE } from './meta-capi.constants';
import { MetaCapiOrderListener } from './meta-capi-order.listener';
import { MetaCapiProcessor } from './meta-capi.processor';
import { MetaCapiService } from './meta-capi.service';
import { MetaCapiTrackController } from './meta-capi-track.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    BullModule.registerQueue({ name: META_CAPI_QUEUE }),
    DlqModule,
    PlatformSettingsModule,
  ],
  controllers: [MetaCapiTrackController],
  providers: [MetaCapiOrderListener, MetaCapiProcessor, MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaCapiModule {}
