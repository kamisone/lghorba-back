import { Controller, Get, Param, Query } from '@nestjs/common';
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
}
