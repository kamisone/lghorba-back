import type { SchedulableBooking } from '../booking-reminders/reminder-scheduler.service';

export const BookingEvents = {
  CONFIRMED:     'booking.confirmed',
  CANCELLED:     'booking.cancelled',
  CREATED_ADMIN: 'booking.created_admin',
  UPDATED:       'booking.updated',
} as const;

// Confirmed via Stripe webhook — triggers invoice generation + reminder scheduling.
export class BookingConfirmedEvent {
  constructor(
    public readonly bookingId:       string,
    public readonly paymentIntentId: string | null,
    public readonly booking:         SchedulableBooking,
  ) {}
}

// Cancelled or payment failed — cancels any pending reminder.
export class BookingCancelledEvent {
  constructor(
    public readonly bookingId:       string,
    public readonly paymentIntentId: string | null,
  ) {}
}

// Created by admin (already confirmed) — schedules reminder immediately.
export class BookingCreatedAdminEvent {
  constructor(
    public readonly booking: SchedulableBooking,
  ) {}
}

// Dates or status changed by admin — the reminder listener reschedules.
export class BookingUpdatedEvent {
  constructor(
    public readonly booking: SchedulableBooking,
  ) {}
}
