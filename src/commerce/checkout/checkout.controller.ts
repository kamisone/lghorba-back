import {
  Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import {
  CheckoutService,
  InitiateCheckoutSchema,
  UpdateShippingSchema,
} from './checkout.service';
import { ShopPaymentService } from '../payment/shop-payment.service';

@Public()
@Controller('public/shop/checkout')
export class CheckoutController {
  constructor(
    private readonly checkoutService:  CheckoutService,
    private readonly paymentService:   ShopPaymentService,
  ) {}

  // POST /public/shop/checkout
  // Validates cart, computes server-side totals, creates draft order, reserves inventory.
  @Post()
  @HttpCode(201)
  initiate(@Body() body: unknown) {
    const dto = InitiateCheckoutSchema.parse(body);
    return this.checkoutService.initiate(dto);
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
