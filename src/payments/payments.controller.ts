import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BookingsService } from '../bookings/bookings.service';
import { CreateBookingDto, CreateBookingSchema } from '../bookings/dto/create-booking.dto';
import { PaymentsService } from './payments.service';
import { InvoiceService } from '../billing/invoice.service';

@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
    private readonly invoiceService: InvoiceService,
  ) {}

  // ── Public booking creation (with payment) ───────────────────────────────

  @Public()
  @Post('public/bookings')
  @UseInterceptors(IdempotencyInterceptor)
  async createPublicBooking(
    @Body(new ZodValidationPipe(CreateBookingSchema)) dto: CreateBookingDto,
    @Req() req: Request,
  ) {
    const idempotencyKey = (req.headers['idempotency-key'] as string | undefined)
      ?? `booking:${dto.carId}:${dto.startDateTime}`;

    const booking = await this.bookingsService.createPendingPaymentBooking(dto);

    const { paymentIntentId, clientSecret } = await this.paymentsService.createPaymentIntent(
      Number(booking.totalPrice),
      booking.id,
      `pi:${idempotencyKey}`,
    );

    await this.bookingsService.setPaymentIntentId(booking.id, paymentIntentId);

    return { ...booking, clientSecret };
  }

  // ── Stripe webhook ────────────────────────────────────────────────────────

  @Public()
  @Post('webhooks/stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Headers('stripe-signature') sig: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const raw = req.rawBody;
    if (!raw) throw new BadRequestException('Missing raw body');

    let event;
    try {
      event = this.paymentsService.constructWebhookEvent(raw, sig);
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${(err as Error)?.message}`);
      throw new BadRequestException('Invalid Stripe signature');
    }

    const intent = event.data.object as { id: string; metadata?: { bookingId?: string } };
    const paymentIntentId = intent.id;

    switch (event.type) {
      case 'payment_intent.succeeded': {
        await this.bookingsService.confirmByPaymentIntent(paymentIntentId);
        // Fire-and-forget: invoice generation runs asynchronously via BullMQ.
        // Failure is handled by BullMQ retry; it must not fail the webhook response.
        const booking = await this.bookingsService
          .findBookingByPaymentIntentId(paymentIntentId)
          .catch(() => null);
        if (booking) {
          await this.invoiceService
            .scheduleInvoiceGeneration(booking.id, paymentIntentId)
            .catch(err => this.logger.error(`Failed to queue invoice for booking ${booking.id}: ${err?.message}`));
        }
        break;
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await this.bookingsService.cancelByPaymentIntent(paymentIntentId);
        break;

      default:
        // Acknowledge all other events without action
        break;
    }

    return { received: true };
  }
}
