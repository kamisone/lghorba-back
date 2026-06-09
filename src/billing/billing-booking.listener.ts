import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingEvents, BookingConfirmedEvent } from '../bookings/booking.events';
import { DocumentService } from '../documents/document.service';
import { InvoiceDataBuilderService } from './invoice-data-builder.service';

@Injectable()
export class BillingBookingListener {
  private readonly logger = new Logger(BillingBookingListener.name);

  constructor(
    private readonly documentService: DocumentService,
    private readonly invoiceBuilder:  InvoiceDataBuilderService,
  ) {}

  @OnEvent(BookingEvents.CONFIRMED)
  async handleBookingConfirmed(event: BookingConfirmedEvent): Promise<void> {
    try {
      const input = await this.invoiceBuilder.buildFromBooking(event.bookingId, event.paymentIntentId);
      await this.documentService.scheduleCreation(input);
    } catch (err) {
      this.logger.error(`Failed to queue invoice for booking ${event.bookingId}: ${(err as Error)?.message}`);
    }
  }
}
