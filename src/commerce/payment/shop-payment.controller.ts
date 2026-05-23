import {
  Body, Controller, Headers, HttpCode, Post, RawBodyRequest, Req,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ShopPaymentService } from './shop-payment.service';

@Public()
@Controller('public/shop/payment')
export class ShopPaymentController {
  constructor(private readonly payment: ShopPaymentService) {}

  @Post('intent')
  createIntent(@Body('orderId') orderId: string) {
    return this.payment.createPaymentIntent(orderId);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    await this.payment.processWebhook(req.rawBody!, sig);
    return { received: true };
  }
}
