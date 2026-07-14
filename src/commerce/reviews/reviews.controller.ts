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
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ReviewsService,
  MAX_VIDEO_BYTES,
  VerifyOrderSchema,
  VerifyOrderDto,
  SubmitReviewSchema,
  SubmitReviewDto,
  ModerateReviewSchema,
  ModerateReviewDto,
  AdminUpdateReviewSchema,
  AdminUpdateReviewDto,
} from './reviews.service';

interface AdminRequest extends Request {
  user: { id: number; email: string };
}

function extractIp(req: Request): string | null {
  const forwarded = ((req.headers['x-forwarded-for'] as string) ?? '')
    .split(',')[0]
    .trim();
  return (req as { ip?: string }).ip ?? (forwarded || null);
}

@Controller('admin/shop/reviews')
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reviews.adminList(
      status,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Patch(':id/moderate')
  moderate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ModerateReviewSchema)) dto: ModerateReviewDto,
    @Req() req: AdminRequest,
  ) {
    return this.reviews.moderate(id, dto, req.user.email);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminUpdateReviewSchema))
    dto: AdminUpdateReviewDto,
  ) {
    return this.reviews.adminUpdate(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.reviews.adminDelete(id);
  }
}

@Public()
@Controller('public/shop/reviews')
export class ReviewsPublicController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('verify-order')
  @HttpCode(200)
  verifyOrder(
    @Body(new ZodValidationPipe(VerifyOrderSchema)) dto: VerifyOrderDto,
  ) {
    return this.reviews.verifyOrder(dto);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FilesInterceptor('media', 5, {
      limits: { fileSize: MAX_VIDEO_BYTES, files: 5 },
    }),
  )
  submit(
    @Body(new ZodValidationPipe(SubmitReviewSchema)) dto: SubmitReviewDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    return this.reviews.submit(dto, files ?? [], {
      ip: extractIp(req),
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('product/:productId')
  listForProduct(
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reviews.listForProduct(
      productId,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Get('product/:productId/stats')
  stats(@Param('productId') productId: string) {
    return this.reviews.getStats(productId);
  }
}
