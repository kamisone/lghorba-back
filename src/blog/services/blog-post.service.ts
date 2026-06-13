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
import { Translation } from '../../translations/translation.entity';
import { ET_BLOG_CATEGORY, ET_BLOG_POST } from '../../common/entity-types';

// ── Schemas ──────────────────────────────────────────────────────────────────

const PostTranslationFieldsSchema = z.object({
  title:            z.string().min(1).max(500).optional(),
  slug:             z.string().min(1).max(500).optional(),
  excerpt:          z.string().max(5000).nullish(),
  content:          z.string().nullish(),
  seoTitle:         z.string().max(500).nullish(),
  seoDescription:   z.string().max(500).nullish(),
  canonicalUrl:     z.string().url().nullish(),
  featuredImageAlt: z.string().max(300).nullish(),
});

const PostTranslationsSchema = z
  .object({
    en: PostTranslationFieldsSchema.optional(),
    fr: PostTranslationFieldsSchema.optional(),
  })
  .refine((t) => t.en?.title || t.fr?.title, {
    message: 'At least one language must provide a title',
  });

export const UpsertBlogPostSchema = z.object({
  status:             z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  featuredImageKey:   z.string().max(1000).nullish(),
  scheduledPublishAt: z.string().datetime().nullish(),
  featured:           z.boolean().optional(),
  authorId:           z.string().uuid().nullish(),
  authorName:         z.string().max(200).nullish(),
  categoryIds:        z.array(z.string().uuid()).optional(),
  tagIds:             z.array(z.string().uuid()).optional(),
  translations:       PostTranslationsSchema,
});

export const UpdateBlogPostSchema = z.object({
  status:             z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  featuredImageKey:   z.string().max(1000).nullish(),
  scheduledPublishAt: z.string().datetime().nullish(),
  featured:           z.boolean().optional(),
  authorId:           z.string().uuid().nullish(),
  authorName:         z.string().max(200).nullish(),
  categoryIds:        z.array(z.string().uuid()).optional(),
  tagIds:             z.array(z.string().uuid()).optional(),
  translations: z
    .object({
      en: PostTranslationFieldsSchema.optional(),
      fr: PostTranslationFieldsSchema.optional(),
    })
    .optional(),
});

export type UpsertBlogPostDto = z.infer<typeof UpsertBlogPostSchema>;
export type UpdateBlogPostDto = z.infer<typeof UpdateBlogPostSchema>;

// ── List filter types ─────────────────────────────────────────────────────────

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

// ── Internal helpers ──────────────────────────────────────────────────────────

const TRANSLATABLE_FIELDS = [
  'title', 'slug', 'excerpt', 'content',
  'seoTitle', 'seoDescription', 'canonicalUrl', 'featuredImageAlt',
] as const;

type TranslatableField = typeof TRANSLATABLE_FIELDS[number];

function buildLocaleMap(rows: Translation[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    if (!map[row.lang]) map[row.lang] = {};
    map[row.lang][row.field] = row.value;
  }
  return map;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BlogPostService {
  constructor(
    @InjectRepository(BlogPost)     private readonly postRepo:     Repository<BlogPost>,
    @InjectRepository(BlogCategory) private readonly categoryRepo: Repository<BlogCategory>,
    @InjectRepository(BlogTag)      private readonly tagRepo:      Repository<BlogTag>,
    private readonly assetUrlService:   AssetUrlService,
    private readonly translationsService: TranslationsService,
  ) {}

  // ── Image enrichment ───────────────────────────────────────────────────────

  private async enrichPost<T extends BlogPost>(post: T): Promise<T & { featuredImageUrl: string | null }> {
    const url = post.featuredImageKey ? await this.assetUrlService.resolve(post.featuredImageKey) : null;
    return Object.assign(post, { featuredImageUrl: url });
  }

  private async enrichPosts<T extends BlogPost>(posts: T[]): Promise<(T & { featuredImageUrl: string | null })[]> {
    if (!posts.length) return [];
    const keys   = posts.map((p) => p.featuredImageKey).filter(Boolean) as string[];
    const urlMap = keys.length ? await this.assetUrlService.resolveBatch(keys) : new Map<string, string>();
    return posts.map((p) =>
      Object.assign(p, { featuredImageUrl: p.featuredImageKey ? (urlMap.get(p.featuredImageKey) ?? null) : null }),
    );
  }

  // ── Slug helpers ───────────────────────────────────────────────────────────

  private async generateUniqueSlug(base: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(base);
    let slug       = baseSlug;
    let counter    = 2;
    while (true) {
      const existing = await this.postRepo.findOne({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${baseSlug}-${counter++}`;
    }
  }

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  async adminList(filter: AdminListFilter = {}): Promise<{ items: any[]; total: number }> {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .leftJoinAndSelect('p.tags', 'tag');

    if (filter.status)   qb.andWhere('p.status = :status',   { status: filter.status });
    if (filter.featured !== undefined) qb.andWhere('p.featured = :featured', { featured: filter.featured });

    if (filter.locale) {
      // Match posts whose canonical locale equals OR that have a title translation in this locale
      qb.andWhere(
        `(p.locale = :locale OR EXISTS (
          SELECT 1 FROM "translations" t
          WHERE t."entityType" = 'blog_post'
            AND t."entityId"   = CAST(p.id AS text)
            AND t.lang         = :locale
            AND t.field        = 'title'
        ))`,
        { locale: filter.locale },
      );
    }

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

    const raw = await qb
      .orderBy('p.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    const enriched = await this.enrichPosts(raw);

    // Bulk-load translations for posts and their categories
    const postIds   = enriched.map((p) => p.id);
    const allCatIds = [...new Set(enriched.flatMap((p) => p.categories.map((c) => c.id)))];

    const [postRows, catRows] = await Promise.all([
      postIds.length   ? this.translationsService.findForEntities(ET_BLOG_POST,     postIds)   : Promise.resolve([]),
      allCatIds.length ? this.translationsService.findForEntities(ET_BLOG_CATEGORY, allCatIds) : Promise.resolve([]),
    ]);

    const items = enriched.map((post) => {
      const canonicalLocale = (post.locale ?? 'fr') as string;
      const myRows = postRows.filter((r) => r.entityId === post.id);
      const transMap = buildLocaleMap(myRows);

      // Seed canonical locale from entity flat columns (fallback for pre-i18n data)
      if (!transMap[canonicalLocale]) transMap[canonicalLocale] = {};
      if (!transMap[canonicalLocale]['title']) transMap[canonicalLocale]['title'] = post.title;
      if (!transMap[canonicalLocale]['slug'])  transMap[canonicalLocale]['slug']  = post.slug;

      const categories = post.categories.map((cat) => ({
        ...cat,
        translations: this.seedCategoryTranslations(
          cat,
          buildLocaleMap(catRows.filter((r) => r.entityId === cat.id)),
        ),
      }));

      return {
        id:                 post.id,
        status:             post.status,
        featured:           post.featured,
        authorName:         post.authorName,
        featuredImageUrl:   post.featuredImageUrl,
        readingTimeMinutes: post.readingTimeMinutes,
        publishedAt:        post.publishedAt,
        scheduledPublishAt: post.scheduledPublishAt,
        createdAt:          post.createdAt,
        categories,
        tags:               post.tags,
        translations:       transMap,
      };
    });

    return { items, total };
  }

  async adminFindOne(id: string): Promise<any> {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['categories', 'tags'],
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return this.buildAdminDetailResponse(await this.enrichPost(post));
  }

  async create(dto: UpsertBlogPostDto): Promise<any> {
    const { fr, en } = dto.translations;

    // FR is canonical; fall back to EN if FR has no title
    const canonicalLocale  = fr?.title ? 'fr' : 'en';
    const canonical        = canonicalLocale === 'fr' ? fr : en;
    const canonicalTitle   = canonical?.title ?? '';
    const canonicalSlugSrc = canonical?.slug ?? canonicalTitle;
    const slug = await this.generateUniqueSlug(canonicalSlugSrc);

    const [categories, tags] = await Promise.all([
      dto.categoryIds?.length ? this.categoryRepo.findBy({ id: In(dto.categoryIds) }) : Promise.resolve([]),
      dto.tagIds?.length      ? this.tagRepo.findBy({ id: In(dto.tagIds) })           : Promise.resolve([]),
    ]);

    const publishedAt = this.resolvePublishedAt(dto);

    const post = this.postRepo.create({
      slug,
      locale:             canonicalLocale,
      status:             dto.status             ?? 'draft',
      title:              canonicalTitle,
      excerpt:            canonical?.excerpt     ?? null,
      content:            canonical?.content     ?? null,
      featuredImageKey:   dto.featuredImageKey   ?? null,
      featuredImageAlt:   canonical?.featuredImageAlt ?? null,
      seoTitle:           canonical?.seoTitle    ?? null,
      seoDescription:     canonical?.seoDescription  ?? null,
      canonicalUrl:       canonical?.canonicalUrl     ?? null,
      scheduledPublishAt: dto.scheduledPublishAt ? new Date(dto.scheduledPublishAt) : null,
      featured:           dto.featured ?? false,
      authorId:           dto.authorId   ?? null,
      authorName:         dto.authorName ?? null,
      readingTimeMinutes: calculateReadingTime(canonical?.content ?? null),
      publishedAt,
      categories,
      tags,
    });

    const saved = await this.postRepo.save(post);
    await this.upsertPostTranslations(saved.id, dto.translations, canonicalLocale, slug);

    return this.buildAdminDetailResponse(await this.enrichPost(saved));
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<any> {
    const post = await this.postRepo.findOne({
      where:     { id },
      relations: ['categories', 'tags'],
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);

    const canonicalLocale = (post.locale ?? 'fr') as 'en' | 'fr';

    // Update entity flat columns from the canonical locale's translation
    const canonical = dto.translations?.[canonicalLocale];
    if (canonical) {
      if (canonical.slug && canonical.slug !== post.slug) {
        post.slug = await this.generateUniqueSlug(canonical.slug, id);
      } else if (canonical.title && canonical.title !== post.title && !canonical.slug) {
        if (post.status === 'draft') {
          post.slug = await this.generateUniqueSlug(canonical.title, id);
        }
      }

      if (canonical.title            !== undefined) post.title            = canonical.title;
      if (canonical.excerpt          !== undefined) post.excerpt          = canonical.excerpt    ?? null;
      if (canonical.seoTitle         !== undefined) post.seoTitle         = canonical.seoTitle   ?? null;
      if (canonical.seoDescription   !== undefined) post.seoDescription   = canonical.seoDescription ?? null;
      if (canonical.canonicalUrl     !== undefined) post.canonicalUrl     = canonical.canonicalUrl    ?? null;
      if (canonical.featuredImageAlt !== undefined) post.featuredImageAlt = canonical.featuredImageAlt ?? null;
      if (canonical.content          !== undefined) {
        post.content            = canonical.content ?? null;
        post.readingTimeMinutes = calculateReadingTime(post.content);
      }
    }

    // Shared non-translatable fields
    if (dto.status             !== undefined) post.status             = dto.status;
    if (dto.featuredImageKey   !== undefined) post.featuredImageKey   = dto.featuredImageKey ?? null;
    if (dto.featured           !== undefined) post.featured           = dto.featured;
    if (dto.authorId           !== undefined) post.authorId           = dto.authorId   ?? null;
    if (dto.authorName         !== undefined) post.authorName         = dto.authorName ?? null;
    if (dto.scheduledPublishAt !== undefined) {
      post.scheduledPublishAt = dto.scheduledPublishAt ? new Date(dto.scheduledPublishAt) : null;
    }

    if (dto.categoryIds !== undefined) {
      post.categories = dto.categoryIds.length
        ? await this.categoryRepo.findBy({ id: In(dto.categoryIds) })
        : [];
    }
    if (dto.tagIds !== undefined) {
      post.tags = dto.tagIds.length
        ? await this.tagRepo.findBy({ id: In(dto.tagIds) })
        : [];
    }

    post.publishedAt = this.resolvePublishedAt({ ...post, ...dto } as any, post.publishedAt);

    const saved = await this.postRepo.save(post);

    if (dto.translations) {
      await this.upsertPostTranslations(saved.id, dto.translations, canonicalLocale, saved.slug);
    }

    return this.buildAdminDetailResponse(await this.enrichPost(saved));
  }

  async publish(id: string): Promise<any> {
    const post = await this.postRepo.findOne({ where: { id }, relations: ['categories', 'tags'] });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    if (post.status === 'published') return this.buildAdminDetailResponse(await this.enrichPost(post));
    post.status      = 'published';
    post.publishedAt = post.publishedAt ?? new Date();
    return this.buildAdminDetailResponse(await this.enrichPost(await this.postRepo.save(post)));
  }

  async archive(id: string): Promise<any> {
    const post = await this.postRepo.findOne({ where: { id }, relations: ['categories', 'tags'] });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    post.status = 'archived';
    return this.buildAdminDetailResponse(await this.enrichPost(await this.postRepo.save(post)));
  }

  async remove(id: string): Promise<void> {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    if (post.featuredImageKey) void this.assetUrlService.invalidate(post.featuredImageKey);
    await this.translationsService.deleteForEntity(ET_BLOG_POST, id);
    await this.postRepo.delete(id);
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  async publicList(filter: PublicListFilter = {}): Promise<{ items: any[]; total: number }> {
    const qb = this.postRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .leftJoinAndSelect('p.tags', 'tag')
      .where('p.status = :status', { status: 'published' });

    if (filter.locale)   qb.andWhere('p.locale = :locale', { locale: filter.locale });
    if (filter.featured) qb.andWhere('p.featured = :f', { f: true });
    if (filter.categoryId) qb.andWhere('cat.id = :categoryId', { categoryId: filter.categoryId });
    if (filter.tagId)      qb.andWhere('tag.id = :tagId',      { tagId: filter.tagId });
    if (filter.search) {
      qb.andWhere('(LOWER(p.title) LIKE :q OR LOWER(p.excerpt) LIKE :q)', {
        q: `%${filter.search.toLowerCase()}%`,
      });
    }

    const total  = await qb.getCount();
    const limit  = Math.min(filter.limit  ?? 12, 50);
    const offset = filter.offset ?? 0;

    const raw      = await qb.orderBy('p.featured', 'DESC').addOrderBy('p.publishedAt', 'DESC').limit(limit).offset(offset).getMany();
    const enriched: any[] = await this.enrichPosts(raw);
    const items    = await this.translationsService.maybeApply(enriched, ET_BLOG_POST, filter.lang);
    return { items, total };
  }

  async publicFindBySlug(slug: string, lang?: string): Promise<any> {
    // Try canonical entity slug first
    let post = await this.postRepo.findOne({
      where:     { slug, status: 'published' },
      relations: ['categories', 'tags'],
    });

    // Fall back: look up slug in translations table (alternate-locale slug)
    if (!post) {
      const row = await this.translationsService['repo'].findOne({
        where: { entityType: ET_BLOG_POST, field: 'slug', value: slug, lang: lang ?? '' },
      });
      if (row) {
        post = await this.postRepo.findOne({
          where:     { id: row.entityId, status: 'published' },
          relations: ['categories', 'tags'],
        });
      }
    }

    if (!post) throw new NotFoundException(`Post "${slug}" not found`);

    const enriched: any = await this.enrichPost(post);
    return this.translationsService.maybeApplyOne(enriched, ET_BLOG_POST, lang);
  }

  async publicRelated(postId: string, limit = 3): Promise<BlogPost[]> {
    const post = await this.postRepo.findOne({
      where:     { id: postId },
      relations: ['categories', 'tags'],
    });
    if (!post || !post.categories.length) {
      return this.enrichPosts(await this.postRepo.find({
        where:     { status: 'published' },
        order:     { publishedAt: 'DESC' },
        take:      limit,
        relations: ['categories', 'tags'],
      }));
    }
    const catIds = post.categories.map((c) => c.id);
    return this.enrichPosts(
      await this.postRepo.createQueryBuilder('p')
        .leftJoinAndSelect('p.categories', 'cat')
        .leftJoinAndSelect('p.tags', 'tag')
        .where('p.status = :status', { status: 'published' })
        .andWhere('p.id != :id', { id: postId })
        .andWhere('cat.id IN (:...catIds)', { catIds })
        .orderBy('p.publishedAt', 'DESC')
        .limit(limit)
        .getMany(),
    );
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────

  async publishDue(): Promise<number> {
    const result = await this.postRepo.createQueryBuilder()
      .update(BlogPost)
      .set({ status: 'published', publishedAt: () => `COALESCE("publishedAt", NOW())` })
      .where('status = :status', { status: 'scheduled' })
      .andWhere('"scheduledPublishAt" <= :now', { now: new Date() })
      .execute();
    return result.affected ?? 0;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async upsertPostTranslations(
    postId:          string,
    translations:    { en?: Record<string, any>; fr?: Record<string, any> },
    canonicalLocale: 'en' | 'fr',
    canonicalSlug:   string,
  ): Promise<void> {
    const items: Array<{ entityType: string; entityId: string; field: string; lang: string; value: string }> = [];

    for (const lang of ['en', 'fr'] as const) {
      const trans = translations[lang];
      if (!trans) continue;

      for (const field of TRANSLATABLE_FIELDS) {
        let value: string | null | undefined;

        if (field === 'slug' && lang === canonicalLocale) {
          value = canonicalSlug; // Always sync entity slug back into translations
        } else {
          value = trans[field] as string | null | undefined;
        }

        if (value) {
          items.push({ entityType: ET_BLOG_POST, entityId: postId, field, lang, value });
        }
      }
    }

    if (items.length) await this.translationsService.bulkUpsert({ items });
  }

  /** Build the full admin detail response with `translations` object. */
  private async buildAdminDetailResponse(
    post: BlogPost & { featuredImageUrl: string | null },
  ): Promise<any> {
    const canonicalLocale = (post.locale ?? 'fr') as string;

    const [postRows, catRows] = await Promise.all([
      this.translationsService.findForEntities(ET_BLOG_POST, [post.id]),
      post.categories.length
        ? this.translationsService.findForEntities(ET_BLOG_CATEGORY, post.categories.map((c) => c.id))
        : Promise.resolve([]),
    ]);

    const transMap = buildLocaleMap(postRows);

    // Seed canonical locale from entity flat columns for posts that pre-date i18n
    if (!transMap[canonicalLocale]) transMap[canonicalLocale] = {};
    const canonicalMap = transMap[canonicalLocale];
    if (!canonicalMap['title'])            canonicalMap['title']            = post.title;
    if (!canonicalMap['slug'])             canonicalMap['slug']             = post.slug;
    if (!canonicalMap['excerpt']          && post.excerpt)          canonicalMap['excerpt']          = post.excerpt;
    if (!canonicalMap['content']          && post.content)          canonicalMap['content']          = post.content;
    if (!canonicalMap['seoTitle']         && post.seoTitle)         canonicalMap['seoTitle']         = post.seoTitle;
    if (!canonicalMap['seoDescription']   && post.seoDescription)   canonicalMap['seoDescription']   = post.seoDescription;
    if (!canonicalMap['canonicalUrl']     && post.canonicalUrl)     canonicalMap['canonicalUrl']     = post.canonicalUrl;
    if (!canonicalMap['featuredImageAlt'] && post.featuredImageAlt) canonicalMap['featuredImageAlt'] = post.featuredImageAlt;

    const categories = post.categories.map((cat) => ({
      ...cat,
      translations: this.seedCategoryTranslations(
        cat,
        buildLocaleMap(catRows.filter((r) => r.entityId === cat.id)),
      ),
    }));

    return {
      id:                 post.id,
      status:             post.status,
      featured:           post.featured,
      authorId:           post.authorId,
      authorName:         post.authorName,
      featuredImageKey:   post.featuredImageKey,
      featuredImageUrl:   post.featuredImageUrl,
      readingTimeMinutes: post.readingTimeMinutes,
      publishedAt:        post.publishedAt,
      scheduledPublishAt: post.scheduledPublishAt,
      createdAt:          post.createdAt,
      updatedAt:          post.updatedAt,
      categories,
      tags:               post.tags,
      translations:       transMap,
    };
  }

  private seedCategoryTranslations(
    cat:  { name: string },
    map:  Record<string, Record<string, string>>,
  ): Record<string, Record<string, string>> {
    if (!map['fr']) map['fr'] = {};
    if (!map['fr']['name']) map['fr']['name'] = cat.name;
    return map;
  }

  private resolvePublishedAt(
    dto:      { status?: string; publishedAt?: string | null },
    existing?: Date | null,
  ): Date | null {
    if (dto.publishedAt) return new Date(dto.publishedAt);
    if (dto.status === 'published' && !existing) return new Date();
    return existing ?? null;
  }
}
