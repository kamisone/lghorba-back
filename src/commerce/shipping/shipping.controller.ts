import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ShippingService, UpsertZoneDto, UpsertMethodDto } from './shipping.service';

@Controller('admin/shop/shipping')
export class ShippingAdminController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('zones')
  listZones() { return this.shipping.listZones(); }

  @Post('zones')
  createZone(@Body() dto: UpsertZoneDto) { return this.shipping.createZone(dto); }

  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @Body() dto: Partial<UpsertZoneDto>) {
    return this.shipping.updateZone(id, dto);
  }

  @Delete('zones/:id')
  @HttpCode(204)
  deleteZone(@Param('id') id: string) { return this.shipping.deleteZone(id); }

  @Get('methods')
  listMethods(@Query('zoneId') zoneId?: string) { return this.shipping.listMethods(zoneId); }

  @Post('methods')
  createMethod(@Body() dto: UpsertMethodDto) { return this.shipping.createMethod(dto); }

  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: Partial<UpsertMethodDto>) {
    return this.shipping.updateMethod(id, dto);
  }

  @Delete('methods/:id')
  @HttpCode(204)
  deleteMethod(@Param('id') id: string) { return this.shipping.deleteMethod(id); }
}

@Public()
@Controller('public/shop/shipping')
export class ShippingPublicController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('methods')
  async getMethods(
    @Query('country') country: string,
    @Query('subtotal') subtotal?: string,
    @Query('lang') lang?: string,
  ) {
    const result = await this.shipping.getMethodsForCountry(country, subtotal ? parseInt(subtotal, 10) : 0, lang);
    return result;
  }
}
