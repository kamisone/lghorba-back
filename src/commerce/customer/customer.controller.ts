import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CustomerService,
  UpsertAddressSchema,
  UpsertAddressDto,
} from './customer.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ShopBehaviorAnalyticsService } from '../analytics/shop-behavior-analytics.service';

@Controller('admin/shop/customers')
export class CustomerAdminController {
  constructor(
    private readonly customers: CustomerService,
    private readonly behaviorAnalytics: ShopBehaviorAnalyticsService,
  ) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.customers.adminList(
      search,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.customers.findById(id);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.behaviorAnalytics.getCustomerTimeline(id);
  }

  @Post(':id/addresses')
  addAddress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertAddressSchema)) dto: UpsertAddressDto,
  ) {
    return this.customers.addAddress(id, dto);
  }

  @Patch(':id/addresses/:addressId')
  updateAddress(
    @Param('addressId') addressId: string,
    @Body() dto: Partial<UpsertAddressDto>,
  ) {
    return this.customers.updateAddress(addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  deleteAddress(@Param('addressId') addressId: string) {
    return this.customers.deleteAddress(addressId);
  }
}
