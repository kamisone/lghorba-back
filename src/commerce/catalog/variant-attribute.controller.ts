import {
  Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../auth/public.decorator';
import { VariantAttribute } from '../entities/variant-attribute.entity';
import { VariationOptionValue } from '../entities/variation-option-value.entity';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_VARIANT_ATTR, ET_SHOP_VARIATION_OPTION } from '../../common/entity-types';

@Controller('admin/shop/variant-attributes')
export class VariantAttributeAdminController {
  constructor(
    @InjectRepository(VariantAttribute)
    private readonly attrRepo: Repository<VariantAttribute>,
    @InjectRepository(VariationOptionValue)
    private readonly valueRepo: Repository<VariationOptionValue>,
  ) {}

  @Get()
  list() {
    return this.attrRepo.find({
      relations: ['optionValues'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  @Post()
  create(@Body() dto: Partial<VariantAttribute>) {
    return this.attrRepo.save(this.attrRepo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<VariantAttribute>) {
    await this.attrRepo.update(id, dto);
    return this.attrRepo.findOneOrFail({ where: { id }, relations: ['optionValues'] });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.attrRepo.delete(id);
  }

  // ── Option values ────────────────────────────────────────────────────────────

  @Post(':id/values')
  addValue(
    @Param('id') attributeId: string,
    @Body() dto: Partial<VariationOptionValue>,
  ) {
    return this.valueRepo.save(this.valueRepo.create({ ...dto, attributeId }));
  }

  @Patch(':id/values/:valueId')
  async updateValue(
    @Param('valueId') valueId: string,
    @Body() dto: Partial<VariationOptionValue>,
  ) {
    await this.valueRepo.update(valueId, dto);
    return this.valueRepo.findOneByOrFail({ id: valueId });
  }

  @Delete(':id/values/:valueId')
  @HttpCode(204)
  async removeValue(@Param('valueId') valueId: string) {
    await this.valueRepo.delete(valueId);
  }
}

@Public()
@Controller('public/shop/variant-attributes')
export class VariantAttributePublicController {
  constructor(
    @InjectRepository(VariantAttribute)
    private readonly attrRepo: Repository<VariantAttribute>,
    private readonly translationsService: TranslationsService,
  ) {}

  @Get()
  async list(@Query('lang') lang?: string) {
    const attrs: any[] = await this.attrRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.optionValues', 'v', 'v.isActive = true')
      .where('a.isActive = true')
      .orderBy('a.sortOrder', 'ASC')
      .addOrderBy('v.sortOrder', 'ASC')
      .getMany();

    const translated = await this.translationsService.maybeApply(attrs, ET_SHOP_VARIANT_ATTR, lang);
    for (const attr of translated) {
      if (attr.optionValues?.length) {
        attr.optionValues = await this.translationsService.maybeApply(
          attr.optionValues, ET_SHOP_VARIATION_OPTION, lang,
        );
      }
    }
    return translated;
  }
}
