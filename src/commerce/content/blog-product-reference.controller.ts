import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { BlogProductReferenceService, AttachProductDto } from './blog-product-reference.service';
import { Public } from '../../auth/public.decorator';

// Admin: attach/detach/reorder products on a blog post
@Controller('admin/blog/posts/:postId/products')
export class BlogProductReferenceAdminController {
  constructor(private readonly svc: BlogProductReferenceService) {}

  @Get()
  list(@Param('postId') postId: string) {
    return this.svc.listForPost(postId);
  }

  @Post()
  attach(@Param('postId') postId: string, @Body() dto: AttachProductDto) {
    return this.svc.attach(postId, dto);
  }

  @Delete(':productId')
  detach(@Param('postId') postId: string, @Param('productId') productId: string) {
    return this.svc.detach(postId, productId);
  }

  @Put('reorder')
  reorder(@Param('postId') postId: string, @Body() body: { productIds: string[] }) {
    return this.svc.reorder(postId, body.productIds);
  }
}

// Public: read-only product refs for a blog post
@Controller('public/blog/posts/:postId/products')
export class BlogProductReferencePublicController {
  constructor(private readonly svc: BlogProductReferenceService) {}

  @Public()
  @Get()
  list(@Param('postId') postId: string) {
    return this.svc.listForPost(postId);
  }
}
