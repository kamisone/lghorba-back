import {
  BadRequestException, Body, Controller, Get, HttpCode,
  Param, ParseUUIDPipe, Patch, Post, Put, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import { Public } from '../../auth/public.decorator';
import {
  CheckoutService,
  InitiateCheckoutSchema,
  UpdateShippingSchema,
} from './checkout.service';
import { ShopPaymentService } from '../payment/shop-payment.service';
import {
  CheckoutSessionService,
  UpsertCheckoutSessionSchema,
} from './checkout-session.service';

@Public()
@Controller('public/shop/checkout')
export class CheckoutController {
  constructor(
    private readonly checkoutService:  CheckoutService,
    private readonly paymentService:   ShopPaymentService,
    private readonly sessionService:   CheckoutSessionService,
  ) {}

  // ── Checkout session (persistent form state + resume support) ────────────

  // GET /public/shop/checkout/session?cartToken=xxx[&locale=fr]
  @Get('session')
  getSession(
    @Query('cartToken') cartToken: string,
    @Query('locale')    locale: string,
  ) {
    if (!cartToken) throw new BadRequestException('cartToken is required');
    return this.sessionService.findOrCreate(cartToken, locale || 'fr');
  }

  // PUT /public/shop/checkout/session
  @Put('session')
  @HttpCode(200)
  upsertSession(@Body() body: unknown) {
    const dto = UpsertCheckoutSessionSchema.parse(body);
    return this.sessionService.upsert(dto);
  }

  // GET /public/shop/checkout/resume/:resumeToken
  @Get('resume/:resumeToken')
  getByResumeToken(@Param('resumeToken', ParseUUIDPipe) resumeToken: string) {
    return this.sessionService.findByResumeToken(resumeToken);
  }

  // ── Core checkout flow ────────────────────────────────────────────────────

  // POST /public/shop/checkout
  // Validates cart, computes server-side totals, creates draft order, reserves inventory.
  @Post()
  @HttpCode(201)
  initiate(@Body() body: unknown, @Req() req: Request) {
    const dto = InitiateCheckoutSchema.parse(body);
    // Stored on the order as `clientIpAddress`, which is what geolocates the
    // checkout_started and test_checkout_blocked demand events later.
    const ip = resolveClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;
    return this.checkoutService.initiate(dto, { ip, userAgent });
  }

  // GET /public/shop/checkout/:orderId
  // Returns the current checkout snapshot (useful for page reload / resuming).
  @Get(':orderId')
  getSnapshot(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.checkoutService.getSnapshot(orderId);
  }

  // PATCH /public/shop/checkout/:orderId/shipping
  // Updates shipping selection and returns recalculated totals.
  @Patch(':orderId/shipping')
  updateShipping(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: unknown,
  ) {
    const dto = UpdateShippingSchema.parse(body);
    return this.checkoutService.updateShipping(orderId, dto);
  }

  // GET /public/shop/checkout/validate-coupon?code=X&cartToken=Y
  // Validates a coupon without side effects, returns discount info.
  @Get('validate-coupon')
  validateCoupon(
    @Query('code')      code: string,
    @Query('cartToken') cartToken: string,
  ) {
    return this.checkoutService.validateCouponForCart(code, cartToken);
  }

  // POST /public/shop/checkout/:orderId/payment-intent
  // Transitions draft → awaiting_payment, then creates Stripe PaymentIntent.
  @Post(':orderId/payment-intent')
  @HttpCode(200)
  async createPaymentIntent(@Param('orderId', ParseUUIDPipe) orderId: string) {
    await this.checkoutService.readyForPayment(orderId);
    return this.paymentService.createPaymentIntent(orderId);
  }
}
