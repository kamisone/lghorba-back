import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PageContentService } from './page-content.service';
import { PageContentData } from './page-content.entity';

@Controller()
export class PageContentController {
  constructor(private readonly service: PageContentService) {}

  /** Public — used by static pages to fetch content for SSG/ISR. */
  @Public()
  @Get('public/content/:slug')
  getPublic(
    @Param('slug') slug: string,
    @Query('locale') locale = 'fr',
  ) {
    return this.service.findOne(slug, locale);
  }

  /** Admin — list all records (used to seed editor state). */
  @Get('admin/content')
  findAll() {
    return this.service.findAll();
  }

  /** Admin — fetch one page/locale combination. */
  @Get('admin/content/:slug/:locale')
  findOne(
    @Param('slug') slug: string,
    @Param('locale') locale: string,
  ) {
    return this.service.findOne(slug, locale);
  }

  /** Admin — create or replace one page/locale combination. */
  @Put('admin/content/:slug/:locale')
  upsert(
    @Param('slug') slug: string,
    @Param('locale') locale: string,
    @Body() data: PageContentData,
  ) {
    return this.service.upsert(slug, locale, data);
  }
}
