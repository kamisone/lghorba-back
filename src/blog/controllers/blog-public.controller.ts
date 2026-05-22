import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { BlogCategoryService } from '../services/blog-category.service';
import { BlogPostService } from '../services/blog-post.service';
import { BlogTagService } from '../services/blog-tag.service';

@Public()
@Controller('public/blog')
export class BlogPublicController {
  constructor(
    private readonly postService:     BlogPostService,
    private readonly categoryService: BlogCategoryService,
    private readonly tagService:      BlogTagService,
  ) {}

  @Get('posts')
  list(
    @Query('locale')     locale?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tagId')      tagId?: string,
    @Query('search')     search?: string,
    @Query('featured')   featured?: string,
    @Query('limit')      limit?: string,
    @Query('offset')     offset?: string,
  ) {
    return this.postService.publicList({
      locale,
      categoryId,
      tagId,
      search,
      featured: featured === 'true' ? true : undefined,
      limit:    limit  ? Math.min(parseInt(limit,  10), 50) : undefined,
      offset:   offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('posts/slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.postService.publicFindBySlug(slug);
  }

  @Get('posts/:id/related')
  related(@Param('id') id: string) {
    return this.postService.publicRelated(id);
  }

  @Get('categories')
  listCategories() {
    return this.categoryService.findAll(true);
  }

  @Get('tags')
  listTags() {
    return this.tagService.findAll();
  }
}
