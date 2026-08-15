import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../auth/public.decorator';
import { CartService } from './cart.service';
import { resolveClientIp } from '../../common/utils/client-ip.util';



@Public()
@Controller('public/shop/cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get(':token')
  getCart(
    @Param('token') token: string,
    @Query('userId') userId?: string,
    @Query('lang') lang?: string,
  ) {
    return this.carts.getOrCreate(token, userId, lang);
  }

  @Post(':token/items')
  addItem(
    @Param('token') token: string,
    @Body('variantId') variantId: string,
    @Body('quantity')  quantity: number,
    @Body('selectedOptionValueIds') selectedOptionValueIds: string[] | undefined,
    @Req() req: Request,
  ) {
    const userAgent = (req.headers['user-agent'] as string) ?? null;
    return this.carts.addItem(token, variantId, quantity, selectedOptionValueIds, {
      ip: resolveClientIp(req),
      userAgent,
    });
  }

  // The IP is passed for behaviour-event geolocation only; it is never stored.
  @Put(':token/items/:itemId')
  updateItem(
    @Param('token')  token: string,
    @Param('itemId') itemId: string,
    @Body('quantity') quantity: number,
    @Req() req: Request,
  ) {
    return this.carts.updateItem(
      token,
      itemId,
      quantity,
      resolveClientIp(req),
      (req.headers['user-agent'] as string) ?? null,
    );
  }

  @Delete(':token/items/:itemId')
  removeItem(
    @Param('token')  token: string,
    @Param('itemId') itemId: string,
    @Req() req: Request,
  ) {
    return this.carts.removeItem(
      token,
      itemId,
      resolveClientIp(req),
      (req.headers['user-agent'] as string) ?? null,
    );
  }

  @Post(':token/validate-coupon')
  validateCoupon(
    @Param('token') token: string,
    @Body('code')          code: string,
    @Body('subtotalCents') subtotalCents: number,
  ) {
    return this.carts.validateCoupon(code, subtotalCents);
  }
}
