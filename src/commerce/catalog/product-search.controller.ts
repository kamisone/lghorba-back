import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ProductSearchService } from './product-search.service';
import { RecommendationService } from './recommendation.service';
import { ProductService } from './product.service';
import { Public } from '../../auth/public.decorator';

// ── Public search endpoints ───────────────────────────────────────────────────

@Controller('public/shop')
export class ProductSearchPublicController {
  constructor(
    private readonly searchService: ProductSearchService,
    private readonly recoService:   RecommendationService,
    private readonly productService: ProductService,
  ) {}

  @Public()
  @Get('search')
  search(
    @Query('q')        q:        string  = '',
    @Query('category') category: string  = '',
    @Query('tag')      tag:      string  = '',
    @Query('brand')    brand:    string  = '',
    @Query('minPrice') minPrice: string  = '',
    @Query('maxPrice') maxPrice: string  = '',
    @Query('page')     page:     string  = '1',
    @Query('limit')    limit:    string  = '24',
  ) {
    return this.searchService.search(q, {
      category:  category  || undefined,
      tag:       tag       || undefined,
      brand:     brand     || undefined,
      minPrice:  minPrice  ? parseInt(minPrice, 10)  : undefined,
      maxPrice:  maxPrice  ? parseInt(maxPrice, 10)  : undefined,
    }, parseInt(page, 10), parseInt(limit, 10));
  }

  @Public()
  @Get('search/autocomplete')
  autocomplete(@Query('q') q: string = '', @Query('limit') limit: string = '8') {
    return this.searchService.autocomplete(q, parseInt(limit, 10));
  }

  @Public()
  @Get('products/:slug/recommendations')
  async recommendations(@Param('slug') slug: string, @Query('limit') limit: string = '6') {
    const lim     = parseInt(limit, 10);
    const product = await this.productService.findBySlug(slug);
    const [fbt, similar] = await Promise.all([
      this.recoService.getFrequentlyBoughtTogether(product.id, lim),
      this.recoService.getSimilarProducts(product.id, lim),
    ]);
    return { frequentlyBoughtTogether: fbt, similar };
  }
}

// ── Admin search endpoints ────────────────────────────────────────────────────

@Controller('admin/shop/search')
export class ProductSearchAdminController {
  constructor(private readonly searchService: ProductSearchService) {}

  @Post('reindex')
  reindexAll() {
    return this.searchService.reindexAll();
  }
}
