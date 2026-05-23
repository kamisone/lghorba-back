import { Controller, Get, Query } from '@nestjs/common';
import { VendorConnectService } from './vendor-connect.service';

@Controller('admin/shop/payouts')
export class PayoutsAdminController {
  constructor(private readonly connectService: VendorConnectService) {}

  @Get()
  list(
    @Query('vendorId') vendorId?: string,
    @Query('orderId')  orderId?: string,
    @Query('limit')    limit  = 20,
    @Query('offset')   offset = 0,
  ) {
    return this.connectService.listPayouts({
      vendorId, orderId,
      limit:  Number(limit),
      offset: Number(offset),
    });
  }
}
