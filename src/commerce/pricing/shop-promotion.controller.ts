import {
  Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { ShopPromotionService, CreatePromotionDto, UpdatePromotionDto } from './shop-promotion.service';
import { PromotionTrigger, PromotionScope } from '../entities/shop-promotion.entity';

@Controller('admin/shop/promotions')
export class ShopPromotionAdminController {
  constructor(private readonly svc: ShopPromotionService) {}

  // ── Promotion CRUD ────────────────────────────────────────────────────────

  @Get()
  list(
    @Query('trigger')  trigger?: PromotionTrigger,
    @Query('scope')    scope?:   PromotionScope,
    @Query('isActive') isActive?: string,
    @Query('limit')    limit = 20,
    @Query('offset')   offset = 0,
  ) {
    return this.svc.list({
      trigger,
      scope,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit:    Number(limit),
      offset:   Number(offset),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOneWithLinks(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreatePromotionDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // ── Category links ────────────────────────────────────────────────────────
  // Visible only for scope=category promotions.

  @Get(':id/category-links')
  listCategoryLinks(@Param('id') id: string) {
    return this.svc.listCategoryLinks(id);
  }

  @Post(':id/category-links')
  @HttpCode(201)
  addCategoryLink(@Param('id') id: string, @Body('categoryId') categoryId: string) {
    return this.svc.addCategoryLink(id, categoryId);
  }

  @Delete(':id/category-links/:linkId')
  @HttpCode(204)
  removeCategoryLink(@Param('id') id: string, @Param('linkId') linkId: string) {
    return this.svc.removeCategoryLink(id, linkId);
  }

  // ── Product links ─────────────────────────────────────────────────────────
  // Visible only for scope=product promotions.

  @Get(':id/product-links')
  listProductLinks(@Param('id') id: string) {
    return this.svc.listProductLinks(id);
  }

  @Post(':id/product-links')
  @HttpCode(201)
  addProductLink(@Param('id') id: string, @Body('productId') productId: string) {
    return this.svc.addProductLink(id, productId);
  }

  @Delete(':id/product-links/:linkId')
  @HttpCode(204)
  removeProductLink(@Param('id') id: string, @Param('linkId') linkId: string) {
    return this.svc.removeProductLink(id, linkId);
  }
}
