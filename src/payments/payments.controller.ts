import {
  Body,
  Controller,
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

@Controller()
export class PaymentsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ── Public booking creation (with payment) ───────────────────────────────

  @Public()
  @Post('public/bookings')
  @UseInterceptors(IdempotencyInterceptor)
  async createPublicBooking(
    @Body(new ZodValidationPipe(CreateBookingSchema)) dto: CreateBookingDto,
    @Req() req: Request,
  ) {
    const booking = await this.bookingsService.createPendingPaymentBooking(dto);

    // Stripe idempotency key is scoped to the booking ID so that reattempts
    // for the same car/dates (after a cancellation) never reuse a key that
    // Stripe already associates with different parameters.
    const stripeIdempotencyKey = (req.headers['idempotency-key'] as string | undefined)
      ? `pi:${req.headers['idempotency-key']}:${booking.id}`
      : `pi:${booking.id}`;

    const { paymentIntentId, clientSecret } = await this.paymentsService.createPaymentIntent(
      Number(booking.totalPrice),
      booking.id,
      stripeIdempotencyKey,
    );

    await this.bookingsService.setPaymentIntentId(booking.id, paymentIntentId);

    return { ...booking, clientSecret };
  }
}
