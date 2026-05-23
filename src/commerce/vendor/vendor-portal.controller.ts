import {
  Body, Controller, Get, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { VendorGuard } from './vendor.guard';
import { VendorPortalService } from './vendor-portal.service';
import { VendorConnectService } from './vendor-connect.service';
import { VendorService, UpdateVendorSchema } from './vendor.service';
import { Public } from '../../auth/public.decorator';

interface VendorRequest extends Request {
  user: { id: string; email: string; role: 'vendor' };
}

@Public()
@UseGuards(VendorGuard)
@Controller('vendor')
export class VendorPortalController {
  constructor(
    private readonly portalService:        VendorPortalService,
    private readonly vendorConnectService: VendorConnectService,
    private readonly vendorService:        VendorService,
  ) {}

  @Get('me')
  me(@Req() req: VendorRequest) {
    return this.vendorService.findById(req.user.id);
  }

  @Patch('me')
  updateProfile(@Req() req: VendorRequest, @Body() body: unknown) {
    const dto = UpdateVendorSchema.parse(body);
    return this.vendorService.updateProfile(req.user.id, dto);
  }

  @Get('dashboard')
  dashboard(@Req() req: VendorRequest) {
    return this.portalService.getMyStats(req.user.id);
  }

  @Get('products')
  products(
    @Req() req: VendorRequest,
    @Query('status') status?: string,
    @Query('limit')  limit  = 20,
    @Query('offset') offset = 0,
  ) {
    return this.portalService.getMyProducts(req.user.id, { status, limit: Number(limit), offset: Number(offset) });
  }

  @Get('orders')
  orders(
    @Req() req: VendorRequest,
    @Query('status') status?: string,
    @Query('limit')  limit  = 20,
    @Query('offset') offset = 0,
  ) {
    return this.portalService.getMyOrders(req.user.id, { status, limit: Number(limit), offset: Number(offset) });
  }

  @Get('payouts')
  payouts(
    @Req() req: VendorRequest,
    @Query('limit')  limit  = 20,
    @Query('offset') offset = 0,
  ) {
    return this.portalService.getMyPayouts(req.user.id, { limit: Number(limit), offset: Number(offset) });
  }

  @Post('onboarding/link')
  async onboardingLink(@Req() req: VendorRequest) {
    const url = await this.vendorConnectService.createAccountLink(req.user.id);
    return { url };
  }
}
