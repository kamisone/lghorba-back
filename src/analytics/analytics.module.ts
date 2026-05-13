import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DlqModule } from '../dlq/dlq.module';
import { DateTimeModule } from '../date-time/date-time.module';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { RentPosition } from '../rent-sessions/rent-position.entity';
import { Booking } from '../bookings/booking.entity';
import { Car } from '../cars/car.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsProcessor } from './analytics.processor';
import { ANALYTICS_QUEUE } from './analytics.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([RentSession, RentPosition, Booking, Car]),
    BullModule.registerQueue({ name: ANALYTICS_QUEUE }),
    DlqModule,
    DateTimeModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsProcessor],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
