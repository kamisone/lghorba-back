import {
  Body, Controller, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ReviewsService, CreateReviewSchema, CreateReviewDto } from './reviews.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('admin/shop/reviews')
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query('status') status?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.reviews.adminList(
      status,
      limit  ? parseInt(limit,  10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Patch(':id/moderate')
  moderate(
    @Param('id') id: string,
    @Body('status') status: 'published' | 'rejected',
  ) {
    return this.reviews.moderate(id, status);
  }
}

@Public()
@Controller('public/shop/reviews')
export class ReviewsPublicController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateReviewSchema)) dto: CreateReviewDto) {
    return this.reviews.create(dto);
  }

  @Get('product/:productId')
  listForProduct(@Param('productId') productId: string) {
    return this.reviews.listForProduct(productId, 'published');
  }

  @Get('product/:productId/stats')
  stats(@Param('productId') productId: string) {
    return this.reviews.getStats(productId);
  }
}
