import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { z } from 'zod';
import { BlogCategory } from '../entities/blog-category.entity';
import { BlogPost, BlogPostStatus } from '../entities/blog-post.entity';
import { BlogTag } from '../entities/blog-tag.entity';
import { calculateReadingTime, slugify } from './blog-slug.util';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_BLOG_POST } from '../../common/entity-types';

// ── Schemas ──────────────────────────────────────────────────────────────────

export const UpsertBlogPostSchema = z.object({
  title:              z.string().min(1).max(500),
  slug:               z.string().min(1).max(500).optional(),
  locale:             z.enum(['fr', 'en']).optional(),
  status:             z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  excerpt:            z.string().nullish(),
  content:            z.string().nullish(),
  featuredImageKey:   z.string().max(1000).nullish(),
  featuredImageAlt:   z.string().max(300).nullish(),
  seoTitle:           z.string().max(500).nullish(),
  seoDescription:     z.string().max(500).nullish(),
  canonicalUrl:       z.string().url().nullish(),
  publishedAt:        z.string().datetime().nullish(),
  scheduledPublishAt: z.string().datetime().nullish(),
  featured:           z.boolean().optional(),
  authorId:           z.string().uuid().nullish(),
  authorName:         z.string().max(200).nullish(),
  categoryIds:        z.array(z.string().uuid()).optional(),
  tagIds:             z.array(z.string().uuid()).optional(),
});

export const UpdateBlogPostSchema = UpsertBlogPostSchema.partial();

export type UpsertBlogPostDto = z.infer<typeof UpsertBlogPostSchema>;
export type UpdateBlogPostDto = z.infer<typeof UpdateBlogPostSchema>;

// ── List filters ──────────────────────────────────────────────────────────────

export interface AdminListFilter {
  status?:     BlogPostStatus;
  locale?:     string;
  categoryId?: string;
  tagId?:      string;
  search?:     string;
  featured?:   boolean;
  limit?:      number;
  offset?:     number;
}

export interface PublicListFilter {
  locale?:     string;
  categoryId?: string;
  tagId?:      string;
  search?:     string;
  featured?:   boolean;
  limit?:      number;
  offset?:     number;
  lang?:       string;
}

@Injectable()
export class BlogPostService {
  constructor(
    @InjectRepository(BlogPost)     private readonly postRepo:     Repository<BlogPost>,
    @InjectRepository(BlogCategory) private readonly categoryRepo: Repository<BlogCategory>,
    @InjectRepository(BlogTag)      private readonly tagRepo:      Repository<BlogTag>,
    private readonly assetUrlService: AssetUrlService,
    private readonly translationsService: TranslationsService,
  ) {}

  private async enrichPost<T extends BlogPost>(post: T): Promise<T & { featuredImageUrl: string | null }> {
    const url = post.featuredImageKey ? await this.assetUrlService.resolve(post.featuredImageKey) : null;
    return Object.assign(post, { featuredImageUrl: url });
  }

  private async enrichPosts<T extends BlogPost>(posts: T[]): Promise<(T & { featuredImageUrl: string | null })[]> {
    if (!posts.length) return [];
    const keys = posts.map(p => p.featuredImageKey).filter(Boolean) as string[];
    const urlMap = keys.length ? await this.assetUrlService.resolveBatch(keys) : new Map<string, string>();
    return posts.map(p => Object.assign(p, {
      featuredImageUrl: p.featuredImageKey ? (urlMap.get(p.featuredImageKey) ?? null) : null,
    }));
  }

  // ── Slug helpers ──────────────────────────────────────────────────────────

  private async generateUniqueSlug(base: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(base);
    let slug = baseSlug;
    let counter = 2;
    while (true) {
      const existing = await this.postRepo.findOne({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  async adminList(filter: AdminListFilter = {}): Promise<{ items: BlogPost[]; total: number }> {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .leftJoinAndSelect('p.tags', 'tag');

    if (filter.status)     qb.andWhere('p.status = :status',       { status: filter.status });
    if (filter.locale)     qb.andWhere('p.locale = :locale',       { locale: filter.locale });
    if (filter.featured !== undefined) qb.andWhere('p.featured = :featured', { featured: filter.featured });
    if (filter.categoryId) {
      qb.andWhere('cat.id = :categoryId', { categoryId: filter.categoryId });
    }
    if (filter.tagId) {
      qb.andWhere('tag.id = :tagId', { tagId: filter.tagId });
    }
    if (filter.search) {
      qb.andWhere('(LOWER(p.title) LIKE :q OR LOWER(p.excerpt) LIKE :q)', {
        q: `%${filter.search.toLowerCase()}%`,
      });
    }

    const total  = await qb.getCount();
    const limit  = filter.limit  ?? 50;
    const offset = filter.offset ?? 0;

    const items = await qb
      .orderBy('p.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    return { items: await this.enrichPosts(items), total };
  }

  async adminFindOne(id: string): Promise<BlogPost> {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['categories', 'tags'],
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return this.enrichPost(post);
  }

  async create(dto: UpsertBlogPostDto): Promise<BlogPost> {
    const slug = await this.generateUniqueSlug(dto.slug ?? dto.title);
    const categories = dto.categoryIds?.length
      ? await this.categoryRepo.findBy({ id: In(dto.categoryIds) })
      : [];
    const tags = dto.tagIds?.length
      ? await this.tagRepo.findBy({ id: In(dto.tagIds) })
      : [];

    const publishedAt = this.resolvePublishedAt(dto);

    const post = this.postRepo.create({
      slug,
      locale:             dto.locale             ?? 'fr',
      status:             dto.status             ?? 'draft',
      title:              dto.title,
      excerpt:            dto.excerpt            ?? null,
      content:            dto.content            ?? null,
      featuredImageKey:   dto.featuredImageKey   ?? null,
      featuredImageAlt:   dto.featuredImageAlt   ?? null,
      seoTitle:           dto.seoTitle           ?? null,
      seoDescription:     dto.seoDescription     ?? null,
      canonicalUrl:       dto.canonicalUrl       ?? null,
      scheduledPublishAt: dto.scheduledPublishAt ? new Date(dto.scheduledPublishAt) : null,
      featured:           dto.featured           ?? false,
      authorId:           dto.authorId           ?? null,
      authorName:         dto.authorName         ?? null,
      readingTimeMinutes: calculateReadingTime(dto.content ?? null),
      publishedAt,
      categories,
      tags,
    });
    return this.enrichPost(await this.postRepo.save(post));
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<BlogPost> {
    const post = await this.adminFindOne(id);
    const oldImageKey = post.featuredImageKey;

    if (dto.slug && dto.slug !== post.slug) {
      post.slug = await this.generateUniqueSlug(dto.slug, id);
    } else if (dto.title && dto.title !== post.title && !dto.slug) {
      // Only auto-reslug if post is still draft and has no custom slug
      // (published posts keep their slug for SEO)
      if (post.status === 'draft') {
        post.slug = await this.generateUniqueSlug(dto.title, id);
      }
    }

    if (dto.categoryIds !== undefined) {
      post.categories = dto.categoryIds.length
        ? await this.categoryRepo.findBy({ id: In(dto.categoryIds) })
        : [];
    }
    if (dto.tagIds !== undefined) {
      post.tags = dto.tagIds.length
        ? await this.tagRepo.findBy({ id: In(dto.tagIds) })
        : []
    }

    const fields: Array<keyof UpdateBlogPostDto> = [
      'locale', 'status', 'title', 'excerpt', 'content',
      'featuredImageKey', 'featuredImageAlt', 'seoTitle', 'seoDescription',
      'canonicalUrl', 'featured', 'authorId', 'authorName',
    ];
    for (const f of fields) {
      if (f in dto && dto[f] !== undefined) {
        (post as any)[f] = (dto as any)[f];
      }
    }

    if (dto.scheduledPublishAt !== undefined) {
      post.scheduledPublishAt = dto.scheduledPublishAt ? new Date(dto.scheduledPublishAt) : null;
    }

    if (dto.content !== undefined) {
      post.readingTimeMinutes = calculateReadingTime(dto.content ?? null);
    }

    post.publishedAt = this.resolvePublishedAt({ ...post, ...dto } as any, post.publishedAt);

    if (oldImageKey && oldImageKey !== post.featuredImageKey) {
      void this.assetUrlService.invalidate(oldImageKey);
    }

    return this.enrichPost(await this.postRepo.save(post));
  }

  async publish(id: string): Promise<BlogPost> {
    const post = await this.adminFindOne(id);
    if (post.status === 'published') return post;
    post.status      = 'published';
    post.publishedAt = post.publishedAt ?? new Date();
    return this.enrichPost(await this.postRepo.save(post));
  }

  async archive(id: string): Promise<BlogPost> {
    const post = await this.adminFindOne(id);
    post.status = 'archived';
    return this.enrichPost(await this.postRepo.save(post));
  }

  async remove(id: string): Promise<void> {
    const post = await this.adminFindOne(id);
    if (post.featuredImageKey) {
      void this.assetUrlService.invalidate(post.featuredImageKey);
    }
    await this.postRepo.delete(id);
  }

  // ── Public ────────────────────────────────────────────────────────────────

  async publicList(filter: PublicListFilter = {}): Promise<{ items: any[]; total: number }> {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .leftJoinAndSelect('p.tags', 'tag')
      .where('p.status = :status', { status: 'published' });

    if (filter.locale)   qb.andWhere('p.locale = :locale',   { locale: filter.locale });
    if (filter.featured) qb.andWhere('p.featured = :f',      { f: true });
    if (filter.categoryId) {
      qb.andWhere('cat.id = :categoryId', { categoryId: filter.categoryId });
    }
    if (filter.tagId) {
      qb.andWhere('tag.id = :tagId', { tagId: filter.tagId });
    }
    if (filter.search) {
      qb.andWhere('(LOWER(p.title) LIKE :q OR LOWER(p.excerpt) LIKE :q)', {
        q: `%${filter.search.toLowerCase()}%`,
      });
    }

    const total = await qb.getCount();
    const limit  = Math.min(filter.limit  ?? 12, 50);
    const offset = filter.offset ?? 0;

    const raw = await qb
      .orderBy('p.featured',    'DESC')
      .addOrderBy('p.publishedAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    const enriched: any[] = await this.enrichPosts(raw);
    const items = await this.translationsService.maybeApply(enriched, ET_BLOG_POST, filter.lang);
    return { items, total };
  }

  async publicFindBySlug(slug: string, lang?: string): Promise<any> {
    const post = await this.postRepo.findOne({
      where: { slug, status: 'published' },
      relations: ['categories', 'tags'],
    });
    if (!post) throw new NotFoundException(`Post "${slug}" not found`);
    const enriched: any = await this.enrichPost(post);
    return this.translationsService.maybeApplyOne(enriched, ET_BLOG_POST, lang);
  }

  async publicRelated(postId: string, limit = 3): Promise<BlogPost[]> {
    const post = await this.postRepo.findOne({
      where: { id: postId },
      relations: ['categories', 'tags'],
    });
    if (!post || !post.categories.length) {
      return this.enrichPosts(await this.postRepo.find({
        where:   { status: 'published' },
        order:   { publishedAt: 'DESC' },
        take:    limit,
        relations: ['categories', 'tags'],
      }));
    }
    const catIds = post.categories.map(c => c.id);
    return this.enrichPosts(await this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .leftJoinAndSelect('p.tags', 'tag')
      .where('p.status = :status', { status: 'published' })
      .andWhere('p.id != :id', { id: postId })
      .andWhere('cat.id IN (:...catIds)', { catIds })
      .orderBy('p.publishedAt', 'DESC')
      .limit(limit)
      .getMany());
  }

  // ── Scheduler helper ──────────────────────────────────────────────────────

  async publishDue(): Promise<number> {
    const result = await this.postRepo.createQueryBuilder()
      .update(BlogPost)
      .set({
        status:      'published',
        publishedAt: () => `COALESCE("publishedAt", NOW())`,
      })
      .where('status = :status', { status: 'scheduled' })
      .andWhere('"scheduledPublishAt" <= :now', { now: new Date() })
      .execute();

    return result.affected ?? 0;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolvePublishedAt(
    dto: { status?: string; publishedAt?: string | null },
    existing?: Date | null,
  ): Date | null {
    if (dto.publishedAt) return new Date(dto.publishedAt);
    if (dto.status === 'published' && !existing) return new Date();
    return existing ?? null;
  }
}
