import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BookingEvents,
  BookingCancelledEvent,
  BookingConfirmedEvent,
  BookingCreatedAdminEvent,
  BookingUpdatedEvent,
} from '../bookings/booking.events';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Injectable()
export class BookingReminderListener {
  private readonly logger = new Logger(BookingReminderListener.name);

  constructor(private readonly reminderScheduler: ReminderSchedulerService) {}

  @OnEvent(BookingEvents.CONFIRMED)
  async handleBookingConfirmed(event: BookingConfirmedEvent): Promise<void> {
    await this.reminderScheduler
      .scheduleReminder(event.booking)
      .catch(err =>
        this.logger.warn(
          `Failed to schedule reminder for booking ${event.bookingId}: ${(err as Error)?.message}`,
        ),
      );
  }

  @OnEvent(BookingEvents.CREATED_ADMIN)
  async handleBookingCreatedAdmin(event: BookingCreatedAdminEvent): Promise<void> {
    await this.reminderScheduler
      .scheduleReminder(event.booking)
      .catch(err =>
        this.logger.warn(
          `Failed to schedule reminder for booking ${event.booking.id}: ${(err as Error)?.message}`,
        ),
      );
  }

  @OnEvent(BookingEvents.CANCELLED)
  async handleBookingCancelled(event: BookingCancelledEvent): Promise<void> {
    await this.reminderScheduler
      .cancelReminder(event.bookingId)
      .catch(err =>
        this.logger.warn(
          `Failed to cancel reminder for booking ${event.bookingId}: ${(err as Error)?.message}`,
        ),
      );
  }

  @OnEvent(BookingEvents.UPDATED)
  async handleBookingUpdated(event: BookingUpdatedEvent): Promise<void> {
    await this.reminderScheduler
      .rescheduleReminder(event.booking)
      .catch(err =>
        this.logger.warn(
          `Failed to reschedule reminder for booking ${event.booking.id}: ${(err as Error)?.message}`,
        ),
      );
  }
}
