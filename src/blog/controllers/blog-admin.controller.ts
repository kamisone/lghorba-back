import {
  Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { GcsService } from '../../gcs/gcs.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { BlogCategoryService, CreateCategorySchema, UpdateCategorySchema } from '../services/blog-category.service';
import { BlogPostService, UpdateBlogPostSchema, UpsertBlogPostSchema } from '../services/blog-post.service';
import { BlogTagService, CreateTagSchema, UpdateTagSchema } from '../services/blog-tag.service';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_IMAGE_BYTES      = 10 * 1024 * 1024; // 10 MB

@Controller('admin/blog')
export class BlogAdminController {
  constructor(
    private readonly posts:          BlogPostService,
    private readonly categories:     BlogCategoryService,
    private readonly tags:           BlogTagService,
    private readonly gcs:            GcsService,
    private readonly assetUrlService: AssetUrlService,
  ) {}

  // ── Posts ─────────────────────────────────────────────────────────────────

  @Get('posts')
  listPosts(
    @Query('status')     status?: string,
    @Query('locale')     locale?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tagId')      tagId?: string,
    @Query('search')     search?: string,
    @Query('featured')   featured?: string,
    @Query('limit')      limit?: string,
    @Query('offset')     offset?: string,
  ) {
    return this.posts.adminList({
      status:     status as any,
      locale,
      categoryId,
      tagId,
      search,
      featured:   featured === 'true' ? true : featured === 'false' ? false : undefined,
      limit:      limit  ? parseInt(limit,  10) : undefined,
      offset:     offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('posts/:id')
  getPost(@Param('id') id: string) {
    return this.posts.adminFindOne(id);
  }

  @Post('posts')
  createPost(@Body(new ZodValidationPipe(UpsertBlogPostSchema)) dto: z.infer<typeof UpsertBlogPostSchema>) {
    return this.posts.create(dto);
  }

  @Patch('posts/:id')
  updatePost(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBlogPostSchema)) dto: z.infer<typeof UpdateBlogPostSchema>,
  ) {
    return this.posts.update(id, dto);
  }

  @Post('posts/:id/publish')
  @HttpCode(200)
  publishPost(@Param('id') id: string) {
    return this.posts.publish(id);
  }

  @Post('posts/:id/archive')
  @HttpCode(200)
  archivePost(@Param('id') id: string) {
    return this.posts.archive(id);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  deletePost(@Param('id') id: string) {
    return this.posts.remove(id);
  }

  // ── Media upload ──────────────────────────────────────────────────────────

  @Post('media')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('No file uploaded');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new Error(`Unsupported image type: ${file.mimetype}`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('Image exceeds 10 MB limit');
    }
    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `blog/media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await this.gcs.upload(file.buffer, key, file.mimetype);
    return { key, url: await this.assetUrlService.resolve(key) };
  }

  // ── Categories ────────────────────────────────────────────────────────────

  @Get('categories')
  listCategories(@Query('active') active?: string) {
    return this.categories.findAll(active === 'true');
  }

  @Get('categories/:id')
  getCategory(@Param('id') id: string) {
    return this.categories.findOne(id);
  }

  @Post('categories')
  createCategory(@Body(new ZodValidationPipe(CreateCategorySchema)) dto: z.infer<typeof CreateCategorySchema>) {
    return this.categories.create(dto as any);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCategorySchema)) dto: z.infer<typeof UpdateCategorySchema>,
  ) {
    return this.categories.update(id, dto as any);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  @Get('tags')
  listTags() {
    return this.tags.findAll();
  }

  @Get('tags/:id')
  getTag(@Param('id') id: string) {
    return this.tags.findOne(id);
  }

  @Post('tags')
  createTag(@Body(new ZodValidationPipe(CreateTagSchema)) dto: z.infer<typeof CreateTagSchema>) {
    return this.tags.create(dto);
  }

  @Patch('tags/:id')
  updateTag(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTagSchema)) dto: z.infer<typeof UpdateTagSchema>,
  ) {
    return this.tags.update(id, dto);
  }

  @Delete('tags/:id')
  @HttpCode(204)
  deleteTag(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
