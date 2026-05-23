import {
  Body, Controller, Delete, Get, Param, Post, Query,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { WishlistService } from './wishlist.service';

@Public()
@Controller('public/shop/wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(
    @Query('sessionToken') sessionToken?: string,
    @Query('userId')       userId?: string,
  ) {
    return this.wishlist.list(sessionToken ?? null, userId ?? null);
  }

  @Post()
  add(
    @Body('sessionToken') sessionToken: string,
    @Body('userId')       userId: string,
    @Body('productId')    productId: string,
    @Body('variantId')    variantId?: string,
  ) {
    return this.wishlist.add(sessionToken ?? null, userId ?? null, productId, variantId);
  }

  @Delete(':productId')
  remove(
    @Param('productId')    productId: string,
    @Query('sessionToken') sessionToken?: string,
    @Query('userId')       userId?: string,
  ) {
    return this.wishlist.remove(sessionToken ?? null, userId ?? null, productId);
  }

  @Post('merge')
  merge(
    @Body('sessionToken') sessionToken: string,
    @Body('userId')       userId: string,
  ) {
    return this.wishlist.mergeGuestToUser(sessionToken, userId);
  }
}
