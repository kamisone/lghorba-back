import {
  Body, Controller, Get, Param, Post,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { OrdersService, CreateOrderSchema, CreateOrderDto } from './orders.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Public()
@Controller('public/shop/orders')
export class OrdersPublicController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto) {
    return this.orders.createFromCart(dto);
  }

  // Lookup by order number — safe to expose because the number space is large
  // enough to prevent enumeration and the number is only given to the customer.
  @Get(':orderNumber')
  getByNumber(@Param('orderNumber') orderNumber: string) {
    return this.orders.findByNumber(orderNumber);
  }

  // Removed: GET customer/:email was unauthenticated and returned all orders
  // for any email address — this is an order-data leak. Customer order history
  // must go through an authenticated endpoint.
}
