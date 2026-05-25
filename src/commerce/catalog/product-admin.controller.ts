import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateProductSchema, CreateVariantSchema, ProductService, UpdateProductSchema, UpdateVariantSchema,
} from './product.service';

@Controller('admin/shop/products')
export class ProductAdminController {
  constructor(private readonly products: ProductService) {}

  @Get()
  list(
    @Query('status')   status?: string,
    @Query('search')   search?: string,
    @Query('featured') featured?: string,
    @Query('vendorId') vendorId?: string,
    @Query('limit')    limit?: string,
    @Query('offset')   offset?: string,
  ) {
    return this.products.adminList({
      status,
      search,
      vendorId,
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
      limit:    limit  ? parseInt(limit,  10) : undefined,
      offset:   offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('categories')
  getCategories() { return this.products.getCategories(); }

  @Get('tags')
  getTags() { return this.products.getTags(); }

  @Get('deleted')
  listDeleted(
    @Query('search') search?: string,
    @Query('limit')  limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.products.adminListDeleted({
      search,
      limit:  limit  ? parseInt(limit,  10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) { return this.products.findById(id); }

  @Post()
  create(@Body(new ZodValidationPipe(CreateProductSchema)) dto: z.infer<typeof CreateProductSchema>) {
    return this.products.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) dto: z.infer<typeof UpdateProductSchema>,
  ) {
    return this.products.update(id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) { return this.products.publish(id); }

  @Post(':id/archive')
  archive(@Param('id') id: string) { return this.products.archive(id); }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) { return this.products.softDelete(id); }

  @Delete(':id/permanent')
  @HttpCode(204)
  hardDelete(@Param('id') id: string) { return this.products.hardDelete(id); }

  @Post(':id/restore')
  restore(@Param('id') id: string) { return this.products.restore(id); }

  // ── Variants ──────────────────────────────────────────────────────────────

  @Post(':id/variants')
  addVariant(
    @Param('id') productId: string,
    @Body(new ZodValidationPipe(CreateVariantSchema)) dto: z.infer<typeof CreateVariantSchema>,
  ) {
    return this.products.addVariant(productId, dto);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(UpdateVariantSchema)) dto: z.infer<typeof UpdateVariantSchema>,
  ) {
    return this.products.updateVariant(variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(204)
  deleteVariant(@Param('variantId') variantId: string) {
    return this.products.deleteVariant(variantId);
  }

  /** Generate all possible variant combinations from the product's linked attributes. */
  @Post(':id/variants/generate-combinations')
  @HttpCode(200)
  generateCombinations(@Param('id') productId: string) {
    return this.products.generateVariantCombinations(productId);
  }

  // ── Product-level attribute scoping ────────────────────────────────────────

  @Get(':id/attributes')
  getAttributes(@Param('id') id: string) {
    return this.products.getProductAttributes(id);
  }

  @Post(':id/attributes')
  addAttribute(
    @Param('id') productId: string,
    @Body() dto: { attributeId: string; defaultOptionValueId?: string | null; sortOrder?: number },
  ) {
    return this.products.addProductAttribute(productId, dto.attributeId, dto.defaultOptionValueId, dto.sortOrder);
  }

  @Patch(':id/attributes/:attributeId')
  updateAttribute(
    @Param('id') productId: string,
    @Param('attributeId') attributeId: string,
    @Body() dto: { defaultOptionValueId: string | null },
  ) {
    return this.products.updateProductAttribute(productId, attributeId, dto.defaultOptionValueId);
  }

  @Delete(':id/attributes/:attributeId')
  @HttpCode(204)
  removeAttribute(
    @Param('id') productId: string,
    @Param('attributeId') attributeId: string,
  ) {
    return this.products.removeProductAttribute(productId, attributeId);
  }

}
