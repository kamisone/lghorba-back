import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DlqModule } from '../dlq/dlq.module';
import { DateTimeModule } from '../date-time/date-time.module';
import { Booking } from '../bookings/booking.entity';
import { SmsModule } from '../sms/sms.module';
import { BOOKING_REMINDER_QUEUE } from './booking-reminders.constants';
import { NotificationSettings } from './notification-settings.entity';
import { ReminderLog } from './reminder-log.entity';
import { ReminderSettingsService } from './reminder-settings.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { BookingReminderProcessor } from './booking-reminder.processor';
import { BookingReminderListener } from './booking-reminder.listener';
import { ReminderSettingsController } from './reminder-settings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationSettings, ReminderLog, Booking]),
    BullModule.registerQueue({ name: BOOKING_REMINDER_QUEUE }),
    DlqModule,
    SmsModule,
    DateTimeModule,
  ],
  controllers: [ReminderSettingsController],
  providers: [
    ReminderSettingsService,
    ReminderSchedulerService,
    BookingReminderProcessor,
    BookingReminderListener,
  ],
  exports: [ReminderSchedulerService],
})
export class BookingRemindersModule {}
