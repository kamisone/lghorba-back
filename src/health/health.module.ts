import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '../redis/redis.module';
import { BOOKING_EXPIRATION_QUEUE } from '../bookings/booking-expiration.constants';
import { BOOKING_REMINDER_QUEUE } from '../booking-reminders/booking-reminders.constants';
import { DLQ_QUEUE } from '../dlq/dlq.constants';
import { HealthController } from './health.controller';

@Module({
  imports: [
    RedisModule,
    BullModule.registerQueue(
      { name: BOOKING_EXPIRATION_QUEUE },
      { name: BOOKING_REMINDER_QUEUE },
      { name: DLQ_QUEUE },
    ),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
