import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingEvents, BookingConfirmedEvent } from '../bookings/booking.events';
import { InvoiceService } from './invoice.service';

@Injectable()
export class BillingBookingListener {
  private readonly logger = new Logger(BillingBookingListener.name);

  constructor(private readonly invoiceService: InvoiceService) {}

  @OnEvent(BookingEvents.CONFIRMED)
  async handleBookingConfirmed(event: BookingConfirmedEvent): Promise<void> {
    await this.invoiceService
      .scheduleInvoiceGeneration(event.bookingId, event.paymentIntentId)
      .catch(err =>
        this.logger.error(
          `Failed to queue invoice for booking ${event.bookingId}: ${(err as Error)?.message}`,
        ),
      );
  }
}
