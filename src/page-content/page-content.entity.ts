import { Column, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export interface PageSection {
  title: string;
  body: string; // HTML produced by the WYSIWYG editor
}

export interface PageContentData {
  title: string;
  intro: string;
  sections: PageSection[];
}

@Entity('page_contents')
@Unique(['slug', 'locale'])
export class PageContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 'about' | 'privacy' | 'legal' | 'cookies' */
  @Column()
  slug: string;

  /** 'en' | 'fr' */
  @Column()
  locale: string;

  @Column({ type: 'jsonb', default: '{}' })
  data: PageContentData;

  @UpdateDateColumn()
  updatedAt: Date;
}
