import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageContent, PageContentData } from './page-content.entity';

@Injectable()
export class PageContentService {
  constructor(
    @InjectRepository(PageContent)
    private readonly repo: Repository<PageContent>,
  ) {}

  findAll(): Promise<PageContent[]> {
    return this.repo.find({ order: { slug: 'ASC', locale: 'ASC' } });
  }

  findOne(slug: string, locale: string): Promise<PageContent | null> {
    return this.repo.findOne({ where: { slug, locale } });
  }

  async upsert(slug: string, locale: string, data: PageContentData): Promise<PageContent> {
    let record = await this.repo.findOne({ where: { slug, locale } });
    if (record) {
      record.data = data;
    } else {
      record = this.repo.create({ slug, locale, data });
    }
    return this.repo.save(record);
  }
}
