import { Body, Controller, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { CountryService } from './country.service';

@Public()
@Controller('public/shop/countries')
export class CountryPublicController {
  constructor(private readonly countries: CountryService) {}

  @Get()
  list() { return this.countries.listActive(); }
}

@Controller('admin/shop/countries')
export class CountryAdminController {
  constructor(private readonly countries: CountryService) {}

  @Get()
  listAll() { return this.countries.listAll(); }

  @Patch(':isoCode')
  @HttpCode(200)
  patch(
    @Param('isoCode') isoCode: string,
    @Body() dto: { isActive?: boolean; isShippingEnabled?: boolean },
  ) {
    return this.countries.patch(isoCode, dto);
  }
}
