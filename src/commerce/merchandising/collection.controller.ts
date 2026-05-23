import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';

import { Public } from '../../auth/public.decorator';
import { CollectionService, UpsertCollectionSchema, UpsertCollectionDto } from './collection.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('admin/shop/collections')
export class CollectionAdminController {
  constructor(private readonly collections: CollectionService) {}

  @Get()
  list() { return this.collections.adminList(); }

  @Get(':id')
  getOne(@Param('id') id: string) { return this.collections.findById(id); }

  @Post()
  create(@Body(new ZodValidationPipe(UpsertCollectionSchema)) dto: UpsertCollectionDto) {
    return this.collections.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertCollectionDto>) {
    return this.collections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) { return this.collections.delete(id); }

  @Post(':id/products')
  addProduct(
    @Param('id') collectionId: string,
    @Body('productId') productId: string,
    @Body('sortOrder') sortOrder?: number,
  ) {
    return this.collections.addProduct(collectionId, productId, sortOrder);
  }

  @Delete(':id/products/:productId')
  @HttpCode(204)
  removeProduct(@Param('id') collectionId: string, @Param('productId') productId: string) {
    return this.collections.removeProduct(collectionId, productId);
  }
}

@Public()
@Controller('public/shop/collections')
export class CollectionPublicController {
  constructor(private readonly collections: CollectionService) {}

  @Get()
  list(@Query('lang') lang?: string) { return this.collections.publicList(lang); }

  @Get('featured')
  featured(@Query('lang') lang?: string) { return this.collections.featuredList(lang); }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.collections.findBySlug(slug, true, lang);
  }
}
