import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
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

  @Post()
  create(@Body() dto: any) {
    return this.countries.create(dto);
  }

  @Patch(':isoCode')
  @HttpCode(200)
  patch(@Param('isoCode') isoCode: string, @Body() dto: any) {
    return this.countries.patch(isoCode, dto);
  }

  @Delete(':isoCode')
  @HttpCode(204)
  remove(@Param('isoCode') isoCode: string) {
    return this.countries.remove(isoCode);
  }
}
