import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/booking.entity';
import { Promotion } from './promotion.entity';
import { PromotionUsage } from './promotion-usage.entity';
import { PromotionsService } from './promotions.service';
import { PromotionsAdminController, PublicPromotionsController } from './promotions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Promotion, PromotionUsage, Booking])],
  controllers: [PromotionsAdminController, PublicPromotionsController],
  providers:   [PromotionsService],
  exports:     [PromotionsService],
})
export class PromotionsModule {}
