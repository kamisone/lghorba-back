import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PageContent } from './page-content.entity';
import { PageContentController } from './page-content.controller';
import { PageContentService } from './page-content.service';

@Module({
  imports: [TypeOrmModule.forFeature([PageContent])],
  controllers: [PageContentController],
  providers: [PageContentService],
})
export class PageContentModule {}
