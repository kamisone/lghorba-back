import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TranslationService } from '../../ai/translation.service';
import { CountryService } from './country.service';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(200) });

@Public()
@Controller('public/shop/countries')
export class CountryPublicController {
  constructor(private readonly countries: CountryService) {}

  @Get()
  list(@Query('lang') lang?: string) {
    return this.countries.listActive(lang);
  }
}

@Controller('admin/shop/countries')
export class CountryAdminController {
  constructor(
    private readonly countries: CountryService,
    private readonly translation: TranslationService,
  ) {}

  @Get()
  listAll() {
    return this.countries.listAll();
  }

  @Post()
  create(@Body() dto: any) {
    return this.countries.create(dto);
  }

  // ── AI translation ───────────────────────────────────────────────────────
  // The admin writes the country name in English, then clicks "Generate" to
  // get French (the shop's base language) plus the other overlay languages.
  @Post('sections/name/translate')
  @HttpCode(200)
  translateNameSection(
    @Body(new ZodValidationPipe(TranslateTextSchema))
    dto: z.infer<typeof TranslateTextSchema>,
  ) {
    return this.translation.translateCountryName(dto.text);
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
