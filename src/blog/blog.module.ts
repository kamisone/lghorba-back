import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GcsModule } from '../gcs/gcs.module';
import { BlogAdminController } from './controllers/blog-admin.controller';
import { BlogPublicController } from './controllers/blog-public.controller';
import { BlogCategory } from './entities/blog-category.entity';
import { BlogPost } from './entities/blog-post.entity';
import { BlogTag } from './entities/blog-tag.entity';
import { BlogCategoryService } from './services/blog-category.service';
import { BlogPostService } from './services/blog-post.service';
import { BlogSchedulerService } from './services/blog-scheduler.service';
import { BlogTagService } from './services/blog-tag.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlogPost, BlogCategory, BlogTag]),
    GcsModule,
  ],
  controllers: [BlogAdminController, BlogPublicController],
  providers:   [BlogPostService, BlogCategoryService, BlogTagService, BlogSchedulerService],
  exports:     [BlogPostService, BlogCategoryService, BlogTagService],
})
export class BlogModule {}
