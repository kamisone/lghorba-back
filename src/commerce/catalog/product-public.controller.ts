import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ProductService } from './product.service';
import { ReviewsService } from '../reviews/reviews.service';

@Public()
@Controller('public/shop/products')
export class ProductPublicController {
  constructor(
    private readonly products: ProductService,
    private readonly reviews:  ReviewsService,
  ) {}

  @Get()
  list(
    @Query('categoryId') categoryId?: string,
    @Query('tagId')      tagId?: string,
    @Query('search')     search?: string,
    @Query('featured')   featured?: string,
    @Query('limit')      limit?: string,
    @Query('offset')     offset?: string,
    @Query('lang')       lang?: string,
  ) {
    return this.products.publicList({
      categoryId,
      tagId,
      search,
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
      limit:    limit  ? parseInt(limit,  10) : undefined,
      offset:   offset ? parseInt(offset, 10) : undefined,
      lang,
    });
  }

  @Get('categories')
  getCategories() { return this.products.getCategories(); }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.products.findBySlug(slug, lang);
  }

  @Get(':slug/reviews')
  async listReviews(@Param('slug') slug: string) {
    const product = await this.products.findBySlug(slug);
    return this.reviews.listForProduct(product.id, 'published');
  }

  @Get(':slug/review-stats')
  async getReviewStats(@Param('slug') slug: string) {
    const product = await this.products.findBySlug(slug);
    return this.reviews.getStats(product.id);
  }

  /** Resolve a set of selected option value IDs to a specific SKU/variant. */
  @Post(':slug/variants/resolve')
  async resolveVariant(
    @Param('slug') slug: string,
    @Body() dto: { optionValueIds: string[] },
  ) {
    const product = await this.products.findBySlug(slug);
    return this.products.resolveVariant(product.id, dto.optionValueIds ?? []);
  }

  /**
   * Returns all variants with stock levels and option combinations.
   * Used by the PDP option picker to disable unavailable choices.
   */
  @Get(':slug/variants/availability')
  async getAvailabilityMatrix(@Param('slug') slug: string, @Query('lang') lang?: string) {
    const product = await this.products.findBySlug(slug);
    return this.products.getVariantAvailabilityMatrix(product.id, lang);
  }

  /** Fetch a specific variant by its URL slug (e.g. /products/tshirt/variants/black-m). */
  @Get(':slug/variants/:variantSlug')
  async getVariantBySlug(
    @Param('slug') slug: string,
    @Param('variantSlug') variantSlug: string,
  ) {
    const product = await this.products.findBySlug(slug);
    return this.products.getVariantBySlug(product.id, variantSlug);
  }
}
