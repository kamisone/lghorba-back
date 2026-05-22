import {
  Column, CreateDateColumn, Entity, JoinTable, ManyToMany,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { BlogCategory } from './blog-category.entity';
import { BlogTag } from './blog-tag.entity';

export type BlogPostStatus = 'draft' | 'scheduled' | 'published' | 'archived';

@Entity('blog_posts')
export class BlogPost {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 500, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  locale: string;

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: BlogPostStatus;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  featuredImageKey: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  featuredImageAlt: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  seoTitle: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  seoDescription: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  canonicalUrl: string | null;

  @Column({ type: 'int', default: 0 })
  readingTimeMinutes: number;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledPublishAt: Date | null;

  @Column({ type: 'boolean', default: false })
  featured: boolean;

  @Column({ type: 'uuid', nullable: true })
  authorId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  authorName: string | null;

  @ManyToMany(() => BlogCategory, { eager: true })
  @JoinTable({
    name: 'blog_post_categories',
    joinColumn:        { name: 'postId',     referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories: Relation<BlogCategory>[];

  @ManyToMany(() => BlogTag, { eager: true })
  @JoinTable({
    name: 'blog_post_tags',
    joinColumn:        { name: 'postId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId',  referencedColumnName: 'id' },
  })
  tags: Relation<BlogTag>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
