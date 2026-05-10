import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import Stripe = require('stripe');
import { BookingsService } from './bookings.service';
import { BOOKING_EXPIRATION_QUEUE } from './booking-expiration.constants';
import { STRIPE_CLIENT } from '../payments/stripe.provider';

export interface BookingExpirationJobData {
  bookingId: string;
}

@Processor(BOOKING_EXPIRATION_QUEUE)
export class BookingExpirationProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingExpirationProcessor.name);

  constructor(
    private readonly bookingsService: BookingsService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe.Stripe,
  ) {
    super();
  }

  async process(job: Job<BookingExpirationJobData>): Promise<void> {
    const { bookingId } = job.data;
    this.logger.log(`Processing payment expiration for booking ${bookingId}`);

    const paymentIntentId = await this.bookingsService.expireBookingIfUnpaid(bookingId);

    if (paymentIntentId) {
      this.logger.log(`Cancelling Stripe PI ${paymentIntentId} for expired booking ${bookingId}`);
      try {
        await this.stripe.paymentIntents.cancel(paymentIntentId);
      } catch (err) {
        // Log but do not rethrow — PI cancellation failure should not prevent
        // the job from completing. The PI will auto-expire on Stripe's side.
        this.logger.warn(
          `Could not cancel PaymentIntent ${paymentIntentId}: ${(err as Error)?.message}`,
        );
      }
    }
  }
}
