import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { z } from 'zod';
import { Product } from '../entities/product.entity';
import { ProductInfoSection } from '../entities/product-info-section';
import { ProductTrustBadge, TRUST_BADGE_ICON_NAMES } from '../entities/product-trust-badge';
import { ProductFaq } from '../entities/product-faq';
import { ProductVariant } from '../entities/product-variant.entity';
import { VariantOption } from '../entities/variant-option.entity';
import { VariationOptionValue } from '../entities/variation-option-value.entity';
import { VariantAttribute } from '../entities/variant-attribute.entity';
import { ProductVariantAttribute } from '../entities/product-variant-attribute.entity';
import { ProductOptionValueImage } from '../entities/product-option-value-image.entity';
import { InventoryItem } from '../entities/inventory-item.entity';
import { ProductCategory } from '../entities/product-category.entity';
import { ProductTag } from '../entities/product-tag.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { MediaService } from '../../media/media.service';
import { ProductSearchService } from './product-search.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_PRODUCT, ET_SHOP_VARIANT_ATTR, ET_SHOP_VARIATION_OPTION } from '../../common/entity-types';
import { slugify } from '../../common/utils/slug.util';
import { ProductMediaItem, ResolvedProductMediaItem } from '../entities/product-media-item';
import { ProductStoryItem, ResolvedProductStoryItem } from '../entities/product-story-item';
import { ProductSocialVideo, ResolvedProductSocialVideo } from '../entities/product-social-video';
import { resolveVariantPrice, sumOptionAdjustments } from '../pricing/variant-price';

// ── Schemas ────────────────────────────────────────────────────────────────────

export const ProductMediaItemSchema = z.object({
  key:        z.string().max(1000),
  type:       z.enum(['image', 'video']),
  posterKey:  z.string().max(1000).nullish(),
  altText:    z.string().max(500).nullish(),
  isFeatured: z.boolean().optional(),
});

export const ProductInfoSectionSchema = z.object({
  /** Omit when adding a new section — the server assigns a stable id. */
  id:        z.string().min(1).max(100).optional(),
  key:       z.string().max(100).optional(),
  label:     z.string().min(1).max(200),
  value:     z.string().max(5000),
  sortOrder: z.number().int().optional(),
});

export const ProductTrustBadgeSchema = z.object({
  /** Omit when adding a new badge — the server assigns a stable id. */
  id:        z.string().min(1).max(100).optional(),
  icon:      z.enum(TRUST_BADGE_ICON_NAMES),
  title:     z.string().min(1).max(120),
  subtitle:  z.string().max(200).nullish(),
  link:      z.string().max(2000).nullish(),
  sortOrder: z.number().int().optional(),
});

export const ProductFaqSchema = z.object({
  /** Omit when adding a new FAQ — the server assigns a stable id. */
  id:        z.string().min(1).max(100).optional(),
  question:  z.string().min(1).max(300),
  answer:    z.string().min(1).max(5000),
  sortOrder: z.number().int().optional(),
  isActive:  z.boolean().optional(),
});

export const ProductStoryItemSchema = z.object({
  /** Omit when adding a new item — the server assigns a stable id. */
  id:          z.string().min(1).max(100).optional(),
  key:         z.string().min(1).max(1000),
  location:    z.enum(['side', 'narrative']),
  altText:     z.string().max(500).nullish(),
  title:       z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  sortOrder:   z.number().int().optional(),
  isActive:    z.boolean().optional(),
});

export const ProductSocialVideoSchema = z.object({
  /** Omit when adding a new video — the server assigns a stable id. */
  id:        z.string().min(1).max(100).optional(),
  key:       z.string().min(1).max(1000),
  title:     z.string().max(300).nullish(),
  sortOrder: z.number().int().optional(),
  isActive:  z.boolean().optional(),
});

export const CreateProductSchema = z.object({
  title:              z.string().min(1).max(500),
  slug:               z.string().min(1).max(300).optional(),
  sku:                z.string().max(200).nullish(),
  shortDescription:   z.string().nullish(),
  description:        z.string().nullish(),
  brand:              z.string().max(300).nullish(),
  specifications:     z.record(z.string(), z.unknown()).nullish(),
  infoSections:       z.array(ProductInfoSectionSchema).optional(),
  trustBadges:        z.array(ProductTrustBadgeSchema).optional(),
  faqs:               z.array(ProductFaqSchema).optional(),
  storyGallery:       z.array(ProductStoryItemSchema).optional(),
  socialVideos:       z.array(ProductSocialVideoSchema).optional(),
  socialVideosTitle:  z.string().max(300).nullish(),
  storyNarrativeTitle: z.string().max(300).nullish(),
  documents:          z.array(z.object({
    id:               z.string().min(1).max(100),
    title:            z.string().min(1).max(300),
    storageKey:       z.string().min(1).max(1000),
    originalFilename: z.string().min(1).max(500),
    sizeBytes:        z.number().int().min(0),
    sortOrder:        z.number().int().optional(),
  })).optional(),
  featuredImageKey:   z.string().max(1000).nullish(),
  galleryImageKeys:   z.array(z.string().max(1000)).optional(),
  media:              z.array(ProductMediaItemSchema).optional(),
  seoTitle:           z.string().max(500).nullish(),
  seoDescription:     z.string().nullish(),
  canonicalUrl:       z.string().max(2000).nullish(),
  featured:           z.boolean().optional(),
  primaryCategoryId:  z.string().uuid().nullish(),
  categoryIds:        z.array(z.string().uuid()).optional(),
  tagIds:             z.array(z.string().uuid()).optional(),
  /**
   * Product-level base price in cents. The effective price for any variant is:
   *   basePriceCents + sum(selected option value adjustments)
   * unless a variant has an explicit priceCents override.
   */
  basePriceCents:      z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).nullish(),
  initialStock:        z.number().int().min(0).optional(),
});

export const UpdateProductSchema = CreateProductSchema.omit({ initialStock: true }).extend({
  status: z.enum(['draft', 'active', 'archived', 'hidden']).optional(),
}).partial();

export const CreateVariantSchema = z.object({
  /** Omit to auto-generate from product + options (e.g. TSHIRT-BLK-M) */
  sku:                z.string().min(1).max(200).optional(),
  /** Omit to auto-generate from selected option values (e.g. "Black / M") */
  title:              z.string().min(1).max(500).optional(),
  /**
   * Explicit price override in cents. Omit (or pass null) to use computed pricing:
   *   effective = product.basePriceCents + sum(selected option adjustments)
   */
  priceCents:          z.number().int().min(0).nullish(),
  compareAtPriceCents: z.number().int().min(0).nullish(),
  barcode:             z.string().max(200).nullish(),
  weightGrams:         z.number().int().nullish(),
  mediaKeys:           z.array(z.string().max(1000)).optional(),
  /** Variant-specific hero image — overrides product featured image in PDP */
  featuredMediaKey:    z.string().max(1000).nullish(),
  isDefault:           z.boolean().optional(),
  sortOrder:           z.number().int().optional(),
  initialStock:        z.number().int().min(0).optional(),
  options:             z.array(z.object({ optionValueId: z.string().uuid() })).optional(),
});

export const UpdateVariantSchema = CreateVariantSchema.omit({ initialStock: true }).partial();

export type CreateProductDto   = z.infer<typeof CreateProductSchema>;
export type UpdateProductDto   = z.infer<typeof UpdateProductSchema>;
export type CreateVariantDto   = z.infer<typeof CreateVariantSchema>;
export type UpdateVariantDto   = z.infer<typeof UpdateVariantSchema>;

// ── Variant generation helpers (pure) ─────────────────────────────────────────

/**
 * Returns a stable hash string for a set of option value IDs.
 * Sorted so order of selection doesn't matter.
 * Returns null for zero-option (single-SKU) variants so the partial unique
 * index does not block multiple default variants during product creation.
 */
function buildCombinationHash(optionValueIds: string[]): string | null {
  if (!optionValueIds.length) return null;
  return [...optionValueIds].sort().join('|');
}

/** "Black / M"  — sorted by attribute.sortOrder */
function buildVariantTitle(sorted: VariationOptionValue[]): string {
  return sorted.map(v => v.displayValue ?? v.value).join(' / ');
}

/** "black-m"  — URL-safe slug from option values */
function buildVariantSlug(sorted: VariationOptionValue[]): string | null {
  if (!sorted.length) return null;
  return sorted
    .map(v => (v.displayValue ?? v.value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .join('-');
}

/**
 * Generates a base SKU from product SKU/slug + abbreviated option values.
 * Example: product.sku="TSHIRT" + Black/M → "TSHIRT-BLK-M"
 */
function buildVariantSkuBase(product: Product, sorted: VariationOptionValue[]): string {
  const prefix = (product.sku ?? product.slug)
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!sorted.length) return prefix;
  const parts = sorted.map(v => v.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
  return `${prefix}-${parts.join('-')}`;
}

/** Ensures at most one item is marked `isFeatured`, keeping the first occurrence. */
function normalizeMedia(media: ProductMediaItem[]): ProductMediaItem[] {
  let featuredSeen = false;
  return media.map(m => {
    if (!m.isFeatured) return m;
    if (featuredSeen) return { ...m, isFeatured: false };
    featuredSeen = true;
    return m;
  });
}

/** Assigns stable ids to new sections and re-derives sortOrder from array position. */
function normalizeInfoSections(sections: z.infer<typeof ProductInfoSectionSchema>[]): ProductInfoSection[] {
  return sections.map((s, i) => ({
    id:        s.id ?? randomUUID(),
    key:       s.key ?? 'custom',
    label:     s.label,
    value:     s.value,
    sortOrder: i,
  }));
}

/** Assigns stable ids to new badges and re-derives sortOrder from array position. */
function normalizeTrustBadges(badges: z.infer<typeof ProductTrustBadgeSchema>[]): ProductTrustBadge[] {
  return badges.map((b, i) => ({
    id:        b.id ?? randomUUID(),
    icon:      b.icon,
    title:     b.title,
    subtitle:  b.subtitle?.trim() ? b.subtitle : undefined,
    link:      b.link?.trim() ? b.link : undefined,
    sortOrder: i,
  }));
}

/** Assigns stable ids to new FAQs and re-derives sortOrder from array position. */
function normalizeFaqs(faqs: z.infer<typeof ProductFaqSchema>[]): ProductFaq[] {
  return faqs.map((f, i) => ({
    id:        f.id ?? randomUUID(),
    question:  f.question,
    answer:    f.answer,
    sortOrder: i,
    isActive:  f.isActive ?? true,
  }));
}

/**
 * Assigns stable ids to new story items and re-derives sortOrder from array
 * position within each location (side and narrative are ordered independently).
 */
function normalizeStoryGallery(items: z.infer<typeof ProductStoryItemSchema>[]): ProductStoryItem[] {
  const counters: Record<string, number> = { side: 0, narrative: 0 };
  return items.map(s => ({
    id:          s.id ?? randomUUID(),
    key:         s.key,
    location:    s.location,
    altText:     s.altText?.trim() ? s.altText : null,
    title:       s.title ?? '',
    description: s.description ?? '',
    sortOrder:   counters[s.location]++,
    isActive:    s.isActive ?? true,
  }));
}

/** Assigns stable ids to new social videos and re-derives sortOrder from array position. */
function normalizeSocialVideos(items: z.infer<typeof ProductSocialVideoSchema>[]): ProductSocialVideo[] {
  return items.map((v, i) => ({
    id:        v.id ?? randomUUID(),
    key:       v.key,
    title:     v.title?.trim() ? v.title : null,
    sortOrder: i,
    isActive:  v.isActive ?? true,
  }));
}

function normalizeDocuments(docs: Array<{ id: string; title: string; storageKey: string; originalFilename: string; sizeBytes: number; sortOrder?: number }>): import('../entities/product-document').ProductDocument[] {
  return docs.map((d, i) => ({
    id:               d.id,
    title:            d.title,
    storageKey:       d.storageKey,
    originalFilename: d.originalFilename,
    sizeBytes:        d.sizeBytes,
    sortOrder:        d.sortOrder ?? i,
  }));
}

/** Derives the legacy featuredImageKey/galleryImageKeys columns from the image-type subset of `media`. */
function deriveLegacyImageFields(media: ProductMediaItem[]): { featuredImageKey: string | null; galleryImageKeys: string[] } {
  const images = media.filter(m => m.type === 'image');
  const featured = images.find(m => m.isFeatured) ?? images[0];
  return {
    featuredImageKey: featured?.key ?? null,
    galleryImageKeys: images.filter(m => m !== featured).map(m => m.key),
  };
}

export interface ProductListFilter {
  status?:     string;
  categoryId?: string;
  tagId?:      string;
  search?:     string;
  featured?:   boolean;
  vendorId?:   string;
  limit?:      number;
  offset?:     number;
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)                  private readonly productRepo:      Repository<Product>,
    @InjectRepository(ProductVariant)           private readonly variantRepo:      Repository<ProductVariant>,
    @InjectRepository(VariantOption)            private readonly variantOptionRepo: Repository<VariantOption>,
    @InjectRepository(VariationOptionValue)     private readonly optionValueRepo:  Repository<VariationOptionValue>,
    @InjectRepository(ProductVariantAttribute)  private readonly productAttrRepo:  Repository<ProductVariantAttribute>,
    @InjectRepository(ProductOptionValueImage)  private readonly optionImageRepo:  Repository<ProductOptionValueImage>,
    @InjectRepository(InventoryItem)            private readonly inventoryRepo:    Repository<InventoryItem>,
    @InjectRepository(ProductCategory)          private readonly categoryRepo:     Repository<ProductCategory>,
    @InjectRepository(ProductTag)               private readonly tagRepo:          Repository<ProductTag>,
    private readonly assetUrlService:  AssetUrlService,
    private readonly dataSource:       DataSource,
    @Optional() private readonly searchService: ProductSearchService,
    @Optional() private readonly mediaService: MediaService,
    private readonly translationsService: TranslationsService,
  ) {}

  private syncProductMediaUsage(product: Product): void {
    if (!this.mediaService) return;
    const keys: Array<{ key: string; field: string }> = [];
    if (product.featuredImageKey) keys.push({ key: product.featuredImageKey, field: 'featuredImageKey' });
    for (const k of product.galleryImageKeys ?? []) keys.push({ key: k, field: 'galleryImageKeys' });
    for (const m of product.media ?? []) {
      keys.push({ key: m.key, field: 'media' });
      if (m.posterKey) keys.push({ key: m.posterKey, field: 'media' });
    }
    for (const s of product.storyGallery ?? []) keys.push({ key: s.key, field: 'storyGallery' });
    for (const v of product.socialVideos ?? []) keys.push({ key: v.key, field: 'socialVideos' });
    this.mediaService
      .syncEntityUsages('product', product.id, keys)
      .catch(err => this.logger.warn(`Media usage sync failed for product ${product.id}: ${(err as Error).message}`));
  }

  private scheduleIndex(product: Product): void {
    if (!this.searchService?.isEnabled) return;
    setImmediate(() => {
      this.searchService.indexProduct(product).catch(err =>
        this.logger.warn(`Search index failed for ${product.id}: ${(err as Error).message}`),
      );
    });
  }

  // ── URL resolution ─────────────────────────────────────────────────────────

  // Resolves featured + gallery + media + all variant media keys in one Redis batch.
  private async resolveProductUrls<T extends Product>(product: T): Promise<T & {
    featuredImageUrl:  string | null;
    galleryImageUrls:  string[];
    media:             ResolvedProductMediaItem[];
    storyGallery:      ResolvedProductStoryItem[];
    socialVideos:      ResolvedProductSocialVideo[];
  }> {
    const variants = (product as any).variants as Array<{ mediaKeys?: string[]; mediaUrls?: string[] }> | undefined;
    const media = product.media ?? [];
    const story = product.storyGallery ?? [];
    const social = (product.socialVideos ?? []).filter(v => v.isActive !== false);

    // Video assets first — their transcode output keys (HLS/MP4/poster) join the URL batch
    const videoKeys = [
      ...media.filter(m => m.type === 'video').map(m => m.key),
      ...social.map(v => v.key),
    ];
    const assetMap = new Map((await (this.mediaService?.findByStorageKeys(videoKeys) ?? Promise.resolve([])))
      .map(a => [a.storageKey, a]));

    const addTranscodeKeys = (keys: Set<string>, sourceKey: string) => {
      const asset = assetMap.get(sourceKey);
      if (asset?.transcodeStatus !== 'ready') return;
      if (asset.hlsKey)        keys.add(asset.hlsKey);
      if (asset.mp4Key)        keys.add(asset.mp4Key);
      if (asset.autoPosterKey) keys.add(asset.autoPosterKey);
    };

    const allKeys = new Set<string>();
    if (product.featuredImageKey)        allKeys.add(product.featuredImageKey);
    for (const k of product.galleryImageKeys ?? []) allKeys.add(k);
    for (const m of media) {
      allKeys.add(m.key);
      if (m.posterKey) allKeys.add(m.posterKey);
      addTranscodeKeys(allKeys, m.key);
    }
    for (const s of story) allKeys.add(s.key);
    for (const v of social) {
      allKeys.add(v.key);
      addTranscodeKeys(allKeys, v.key);
    }
    if (variants) {
      for (const v of variants) for (const k of v.mediaKeys ?? []) allKeys.add(k);
    }

    const urlMap = await this.assetUrlService.resolveBatch([...allKeys]);

    if (variants) {
      for (const v of variants) {
        v.mediaUrls = (v.mediaKeys ?? []).map(k => urlMap.get(k)).filter(Boolean) as string[];
      }
    }

    const resolvedMedia: ResolvedProductMediaItem[] = media.map(m => {
      const asset = assetMap.get(m.key);
      const ready = asset?.transcodeStatus === 'ready';
      // Prefer the optimized MP4 rendition over the raw upload once transcoded
      const mp4Url = ready && asset?.mp4Key ? urlMap.get(asset.mp4Key) : undefined;
      return {
        ...m,
        url:             mp4Url ?? urlMap.get(m.key) ?? '',
        hlsUrl:          ready && asset?.hlsKey ? (urlMap.get(asset.hlsKey) ?? null) : null,
        posterUrl:       m.posterKey
          ? (urlMap.get(m.posterKey) ?? null)
          : (ready && asset?.autoPosterKey ? (urlMap.get(asset.autoPosterKey) ?? null) : null),
        durationSeconds: asset?.durationSeconds ?? null,
        mimeType:        asset?.mimeType ?? null,
      };
    });

    const resolvedSocial: ResolvedProductSocialVideo[] = social.map(v => {
      const asset = assetMap.get(v.key);
      const ready = asset?.transcodeStatus === 'ready';
      const mp4Url = ready && asset?.mp4Key ? urlMap.get(asset.mp4Key) : undefined;
      return {
        ...v,
        url:             mp4Url ?? urlMap.get(v.key) ?? '',
        hlsUrl:          ready && asset?.hlsKey ? (urlMap.get(asset.hlsKey) ?? null) : null,
        posterUrl:       ready && asset?.autoPosterKey ? (urlMap.get(asset.autoPosterKey) ?? null) : null,
        durationSeconds: asset?.durationSeconds ?? null,
      };
    }).filter(v => v.url);

    return Object.assign(product, {
      featuredImageUrl: product.featuredImageKey ? (urlMap.get(product.featuredImageKey) ?? null) : null,
      galleryImageUrls: (product.galleryImageKeys ?? []).map(k => urlMap.get(k)).filter(Boolean) as string[],
      media: resolvedMedia,
      storyGallery: story.map(s => ({ ...s, url: urlMap.get(s.key) ?? '' })),
      socialVideos: resolvedSocial,
    });
  }

  // List resolution: only featured image needed for product cards.
  private async resolveProductsUrls<T extends Product>(products: T[]): Promise<(T & { featuredImageUrl: string | null })[]> {
    if (!products.length) return [];
    const keys = products.map(p => p.featuredImageKey).filter(Boolean) as string[];
    const urlMap = await this.assetUrlService.resolveBatch(keys);
    return products.map(p => Object.assign(p, { featuredImageUrl: p.featuredImageKey ? (urlMap.get(p.featuredImageKey) ?? null) : null }));
  }

  // ── Admin list ──────────────────────────────────────────────────────────────

  async adminList(filter: ProductListFilter = {}): Promise<{ items: any[]; total: number }> {
    const { status, search, featured, vendorId, limit = 20, offset = 0 } = filter;
    const qb = this.productRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .leftJoinAndSelect('p.tags', 'tag')
      .where('p.deletedAt IS NULL')
      .orderBy('p.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (status)   qb.andWhere('p.status = :status',     { status });
    if (featured !== undefined) qb.andWhere('p.featured = :featured', { featured });
    if (vendorId) qb.andWhere('p."vendorId" = :vendorId', { vendorId });
    if (search)   qb.andWhere('(p.title ILIKE :q OR p.sku ILIKE :q)', { q: `%${search}%` });

    const [raw, total] = await qb.getManyAndCount();
    const items = await this.resolveProductsUrls(raw);
    return { items, total };
  }

  async adminListDeleted(filter: { search?: string; limit?: number; offset?: number } = {}): Promise<{ items: any[]; total: number }> {
    const { search, limit = 20, offset = 0 } = filter;
    const qb = this.productRepo.createQueryBuilder('p')
      .withDeleted()
      .leftJoinAndSelect('p.categories', 'cat')
      .where('p.deletedAt IS NOT NULL')
      .orderBy('p.deletedAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) qb.andWhere('(p.title ILIKE :q OR p.sku ILIKE :q)', { q: `%${search}%` });

    const [raw, total] = await qb.getManyAndCount();
    const items = await this.resolveProductsUrls(raw);
    return { items, total };
  }

  // ── Public list ─────────────────────────────────────────────────────────────

  async publicList(filter: ProductListFilter & { lang?: string } = {}): Promise<{ items: any[]; total: number }> {
    const { categoryId, tagId, search, featured, lang, limit = 24, offset = 0 } = filter;
    const qb = this.productRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.categories', 'cat')
      .leftJoinAndSelect('p.tags', 'tag')
      .leftJoinAndSelect('p.variants', 'v')
      .where('p.status = :status', { status: 'active' })
      .andWhere('p.deletedAt IS NULL')
      .orderBy('p.featured', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (categoryId) qb.andWhere('cat.id = :categoryId', { categoryId });
    if (tagId) qb.andWhere('tag.id = :tagId', { tagId });
    if (featured !== undefined) qb.andWhere('p.featured = :featured', { featured });
    if (search) {
      const words = search.trim().split(/\s+/).filter(w => w.length >= 2);
      if (words.length <= 1) {
        qb.andWhere('(p.title ILIKE :q OR p.brand ILIKE :q OR p."shortDescription" ILIKE :q)', { q: `%${search.trim()}%` });
      } else {
        const wordConditions = words.map((_, i) => `(p.title ILIKE :sw${i} OR p.brand ILIKE :sw${i} OR p."shortDescription" ILIKE :sw${i})`);
        const wordParams: Record<string, string> = {};
        words.forEach((w, i) => { wordParams[`sw${i}`] = `%${w}%`; });
        qb.andWhere(
          `(p.title ILIKE :q OR p.brand ILIKE :q OR p."shortDescription" ILIKE :q OR ${wordConditions.join(' OR ')})`,
          { q: `%${search.trim()}%`, ...wordParams },
        );
        const rankExpr = `CASE WHEN p.title ILIKE :q OR p.brand ILIKE :q THEN 1000 ELSE 0 END + ${
          words.map((_, i) => `CASE WHEN p.title ILIKE :sw${i} OR p.brand ILIKE :sw${i} OR p."shortDescription" ILIKE :sw${i} THEN 1 ELSE 0 END`).join(' + ')
        }`;
        qb.addSelect(rankExpr, 'search_rank');
        qb.orderBy('search_rank', 'DESC');
        qb.addOrderBy('p.featured', 'DESC');
        qb.addOrderBy('p.createdAt', 'DESC');
      }
    }

    const [raw, total] = await qb.getManyAndCount();
    const withUrls = await this.resolveProductsUrls(raw) as any[];

    // Resolve effective priceCents for computed-pricing variants before sending to the client.
    for (const p of withUrls) this.resolveVariantPricesInPlace(p);

    // Batch-compute stock flags.
    // outOfStock: true only when inventory items exist AND all variants are ≤ 0.
    // defaultVariantOutOfStock: same logic scoped to the default variant only —
    //   drives "See Details" on listing cards when the pre-selected variant is OOS.
    if (raw.length > 0) {
      const productIds = raw.map(p => p.id);
      const stockRows: Array<{ productId: string; allOutOfStock: boolean }> = await this.dataSource.query(
        `SELECT pv."productId",
                CASE
                  WHEN COUNT(ii.id) = 0 THEN false
                  ELSE BOOL_AND(COALESCE(ii.available, 0) <= 0)
                END AS "allOutOfStock"
         FROM shop_product_variants pv
         LEFT JOIN shop_inventory_items ii ON ii."variantId" = pv.id
         WHERE pv."productId" = ANY($1)
         GROUP BY pv."productId"`,
        [productIds],
      );
      const outOfStockSet = new Set(stockRows.filter(r => r.allOutOfStock).map(r => r.productId));
      for (const p of withUrls) p.outOfStock = outOfStockSet.has(p.id);

      const defaultRows: Array<{ productId: string; defaultOutOfStock: boolean }> = await this.dataSource.query(
        `SELECT pv."productId",
                CASE
                  WHEN COUNT(ii.id) = 0 THEN false
                  ELSE BOOL_AND(COALESCE(ii.available, 0) <= 0)
                END AS "defaultOutOfStock"
         FROM shop_product_variants pv
         LEFT JOIN shop_inventory_items ii ON ii."variantId" = pv.id
         WHERE pv."productId" = ANY($1) AND pv."isDefault" = true
         GROUP BY pv."productId"`,
        [productIds],
      );
      const defaultOosSet = new Set(defaultRows.filter(r => r.defaultOutOfStock).map(r => r.productId));
      for (const p of withUrls) p.defaultVariantOutOfStock = defaultOosSet.has(p.id);
    }

    const items = await this.translationsService.maybeApply(withUrls, ET_SHOP_PRODUCT, lang);
    return { items, total };
  }

  // ── Find by ID (admin) ──────────────────────────────────────────────────────

  /**
   * For variants whose priceCents is null (computed pricing), substitute the product's
   * basePriceCents so consumers that read priceCents directly always get a valid number.
   * Option-value adjustments are not applied here — those are resolved at the variant-
   * picker level via resolveVariantPrice / getVariantAvailabilityMatrix.
   */
  private resolveVariantPricesInPlace(product: any): void {
    for (const v of product.variants ?? []) {
      if (v.priceCents === null || v.priceCents === undefined) {
        v.priceCents = product.basePriceCents ?? 0;
      }
    }
  }

  async findById(id: string): Promise<any> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['categories', 'tags', 'variants', 'variants.options', 'primaryCategory'],
      withDeleted: true,
    });
    if (!product) throw new NotFoundException('Product not found');
    const resolved: any = await this.resolveProductUrls(product);
    this.resolveVariantPricesInPlace(resolved);
    resolved.documents = await this.resolveDocuments(product.id, product.documents ?? []);
    return resolved;
  }

  // ── Find by slug (public) ───────────────────────────────────────────────────

  async findBySlug(slug: string, lang?: string): Promise<any> {
    const product = await this.productRepo.findOne({
      where: { slug, status: 'active' },
      relations: ['categories', 'tags', 'variants', 'variants.options', 'primaryCategory'],
    });
    if (!product) throw new NotFoundException('Product not found');
    const resolved: any = await this.resolveProductUrls(product);
    this.resolveVariantPricesInPlace(resolved);
    const withTranslations = await this.translationsService.maybeApplyOne(resolved, ET_SHOP_PRODUCT, lang);
    withTranslations.infoSections = await this.resolveInfoSections(product.id, product.infoSections, lang);
    withTranslations.trustBadges  = await this.resolveTrustBadges(product.id, product.trustBadges, lang);
    withTranslations.faqs         = await this.resolveFaqs(product.id, product.faqs, lang);
    withTranslations.documents    = await this.resolveDocuments(product.id, product.documents ?? [], lang);
    withTranslations.storyGallery = await this.resolveStoryGallery(product.id, resolved.storyGallery ?? [], lang);

    // Same computation as the listing's outOfStock flag: true only when
    // inventory items exist AND every variant is at 0 or below.
    const stockRows: Array<{ allOutOfStock: boolean }> = await this.dataSource.query(
      `SELECT CASE
                WHEN COUNT(ii.id) = 0 THEN false
                ELSE BOOL_AND(COALESCE(ii.available, 0) <= 0)
              END AS "allOutOfStock"
       FROM shop_product_variants pv
       LEFT JOIN shop_inventory_items ii ON ii."variantId" = pv.id
       WHERE pv."productId" = $1`,
      [product.id],
    );
    withTranslations.outOfStock = !!stockRows[0]?.allOutOfStock;

    return withTranslations;
  }

  /**
   * Generic resolver for per-product translatable ordered lists (info sections,
   * trust badges, ...). Sorts by sortOrder, overlays FR/EN translations matching
   * `fieldPrefix:{id}:{subfield}` against the product's translation rows (only
   * when lang !== 'fr'), then filters with `isNonEmpty`.
   */
  private async resolveTranslatableList<T extends { id: string; sortOrder: number }>(
    productId: string, items: T[], lang: string | undefined,
    fieldPrefix: string, translatableFields: readonly string[], isNonEmpty: (item: T) => boolean,
  ): Promise<T[]> {
    const sorted = [...(items ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(s => ({ ...s }));

    if (lang && lang !== 'fr') {
      const rows = await this.translationsService.findForEntity(ET_SHOP_PRODUCT, productId, lang);
      const fieldRe = new RegExp(`^${fieldPrefix}:(.+):(${translatableFields.join('|')})$`);
      const overrides = new Map<string, Record<string, string>>();
      for (const row of rows) {
        const m = row.field.match(fieldRe);
        if (!m) continue;
        const [, id, sub] = m;
        const entry = overrides.get(id) ?? {};
        entry[sub] = row.value;
        overrides.set(id, entry);
      }
      for (const s of sorted) {
        const ov = overrides.get(s.id);
        if (ov) Object.assign(s, ov);
      }
    }

    return sorted.filter(isNonEmpty);
  }

  /**
   * Sorts info sections by sortOrder, overlays FR/EN translations for the
   * requested lang (stored as `infoSection:{id}:label|value` rows against the
   * product's translation entity), and drops sections with no content.
   */
  private resolveInfoSections(
    productId: string, sections: ProductInfoSection[], lang?: string,
  ): Promise<ProductInfoSection[]> {
    return this.resolveTranslatableList(
      productId, sections, lang, 'infoSection', ['label', 'value'],
      s => !!s.value?.trim() && !!s.label?.trim(),
    );
  }

  /**
   * Sorts trust badges by sortOrder, overlays FR/EN translations for the
   * requested lang (stored as `trustBadge:{id}:title|subtitle` rows against
   * the product's translation entity), and drops badges with no title.
   */
  private resolveTrustBadges(
    productId: string, badges: ProductTrustBadge[], lang?: string,
  ): Promise<ProductTrustBadge[]> {
    return this.resolveTranslatableList(
      productId, badges, lang, 'trustBadge', ['title', 'subtitle'],
      b => !!b.title?.trim(),
    );
  }

  /**
   * Sorts FAQs by sortOrder, overlays FR/EN translations for the requested
   * lang (stored as `faq:{id}:question|answer` rows against the product's
   * translation entity), and drops inactive or empty FAQs.
   */
  private resolveFaqs(
    productId: string, faqs: ProductFaq[], lang?: string,
  ): Promise<ProductFaq[]> {
    return this.resolveTranslatableList(
      productId, faqs, lang, 'faq', ['question', 'answer'],
      f => f.isActive && !!f.question?.trim() && !!f.answer?.trim(),
    );
  }

  /**
   * Sorts Story Gallery items by sortOrder, overlays FR/EN translations for
   * the requested lang (stored as `storyItem:{id}:title|description` rows
   * against the product's translation entity), and drops inactive items or
   * items whose image URL could not be resolved. Items keep their `location`
   * so the storefront can split side vs narrative.
   */
  private resolveStoryGallery(
    productId: string, items: ResolvedProductStoryItem[], lang?: string,
  ): Promise<ResolvedProductStoryItem[]> {
    return this.resolveTranslatableList(
      productId, items, lang, 'storyItem', ['title', 'description'],
      s => s.isActive && !!s.url,
    );
  }

  private async resolveDocuments(
    productId: string, docs: import('../entities/product-document').ProductDocument[], lang?: string,
  ): Promise<Array<import('../entities/product-document').ProductDocument & { url: string }>> {
    const translated = await this.resolveTranslatableList(
      productId, docs, lang, 'document', ['title'],
      d => !!d.title?.trim(),
    );
    return Promise.all(translated.map(async d => ({
      ...d,
      url: await this.assetUrlService.resolve(d.storageKey),
    })));
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateProductDto): Promise<Product> {
    const slug = dto.slug ?? slugify(dto.title);
    const existing = await this.productRepo.findOne({ where: { slug }, withDeleted: true });
    if (existing) throw new ConflictException(`Slug "${slug}" already in use`);

    return this.dataSource.transaction(async (em) => {
      const categories = dto.categoryIds?.length
        ? await em.find(ProductCategory, { where: { id: In(dto.categoryIds) } })
        : [];
      const tags = dto.tagIds?.length
        ? await em.find(ProductTag, { where: { id: In(dto.tagIds) } })
        : [];

      const media = dto.media ? normalizeMedia(dto.media) : [];
      const legacy = dto.media ? deriveLegacyImageFields(media) : null;

      const product = em.create(Product, {
        slug,
        title:             dto.title,
        sku:               dto.sku ?? null,
        shortDescription:  dto.shortDescription ?? null,
        description:       dto.description ?? null,
        brand:             dto.brand ?? null,
        specifications:    (dto.specifications as Record<string, string>) ?? null,
        infoSections:      dto.infoSections ? normalizeInfoSections(dto.infoSections) : [],
        trustBadges:       dto.trustBadges  ? normalizeTrustBadges(dto.trustBadges)  : [],
        faqs:              dto.faqs         ? normalizeFaqs(dto.faqs)                : [],
        storyGallery:      dto.storyGallery ? normalizeStoryGallery(dto.storyGallery) : [],
        socialVideos:      dto.socialVideos ? normalizeSocialVideos(dto.socialVideos) : [],
        socialVideosTitle: dto.socialVideosTitle?.trim() ? dto.socialVideosTitle : null,
        storyNarrativeTitle: dto.storyNarrativeTitle?.trim() ? dto.storyNarrativeTitle : null,
        documents:         dto.documents    ? normalizeDocuments(dto.documents)      : [],
        featuredImageKey:  legacy ? legacy.featuredImageKey : (dto.featuredImageKey ?? null),
        galleryImageKeys:  legacy ? legacy.galleryImageKeys : (dto.galleryImageKeys ?? []),
        media,
        seoTitle:          dto.seoTitle ?? null,
        seoDescription:    dto.seoDescription ?? null,
        canonicalUrl:      dto.canonicalUrl ?? null,
        featured:          dto.featured ?? false,
        status:            'draft',
        primaryCategoryId: dto.primaryCategoryId ?? null,
        basePriceCents:    dto.basePriceCents,
        categories,
        tags,
      });
      const saved = await em.save(Product, product);

      // Default variant uses null priceCents — computed from product.basePriceCents + option adjustments
      const variant = em.create(ProductVariant, {
        productId:           saved.id,
        sku:                 dto.sku ?? `${slug}-default`,
        title:               'Default',
        priceCents:          null,
        compareAtPriceCents: dto.compareAtPriceCents ?? null,
        isDefault:           true,
        sortOrder:           0,
        mediaKeys:           [],
      });
      await em.save(ProductVariant, variant);

      await em.save(InventoryItem, em.create(InventoryItem, {
        variantId: variant.id,
        productId: saved.id,
        available: dto.initialStock ?? 0,
      }));

      this.scheduleIndex(saved);
      this.syncProductMediaUsage(saved);
      return saved;
    });
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id }, relations: ['categories', 'tags'], withDeleted: true });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.slug && dto.slug !== product.slug) {
      const existing = await this.productRepo.findOne({ where: { slug: dto.slug }, withDeleted: true });
      if (existing && existing.id !== id) throw new ConflictException('Slug already in use');
      product.slug = dto.slug;
    }

    const media = dto.media !== undefined ? normalizeMedia(dto.media) : product.media;
    const legacy = dto.media !== undefined ? deriveLegacyImageFields(media) : null;

    Object.assign(product, {
      title:             dto.title              ?? product.title,
      sku:               dto.sku                !== undefined ? dto.sku ?? null : product.sku,
      shortDescription:  dto.shortDescription   !== undefined ? dto.shortDescription ?? null : product.shortDescription,
      description:       dto.description        !== undefined ? dto.description ?? null : product.description,
      brand:             dto.brand              !== undefined ? dto.brand ?? null : product.brand,
      specifications:    dto.specifications     !== undefined ? dto.specifications ?? null : product.specifications,
      infoSections:      dto.infoSections       !== undefined ? normalizeInfoSections(dto.infoSections) : product.infoSections,
      trustBadges:       dto.trustBadges        !== undefined ? normalizeTrustBadges(dto.trustBadges)  : product.trustBadges,
      faqs:              dto.faqs               !== undefined ? normalizeFaqs(dto.faqs)               : product.faqs,
      storyGallery:      dto.storyGallery       !== undefined ? normalizeStoryGallery(dto.storyGallery) : product.storyGallery,
      socialVideos:      dto.socialVideos       !== undefined ? normalizeSocialVideos(dto.socialVideos) : product.socialVideos,
      socialVideosTitle: dto.socialVideosTitle  !== undefined ? (dto.socialVideosTitle?.trim() ? dto.socialVideosTitle : null) : product.socialVideosTitle,
      storyNarrativeTitle: dto.storyNarrativeTitle !== undefined ? (dto.storyNarrativeTitle?.trim() ? dto.storyNarrativeTitle : null) : product.storyNarrativeTitle,
      documents:         dto.documents          !== undefined ? normalizeDocuments(dto.documents)     : product.documents,
      featuredImageKey:  legacy ? legacy.featuredImageKey : (dto.featuredImageKey !== undefined ? dto.featuredImageKey ?? null : product.featuredImageKey),
      galleryImageKeys:  legacy ? legacy.galleryImageKeys : (dto.galleryImageKeys ?? product.galleryImageKeys),
      media,
      seoTitle:          dto.seoTitle           !== undefined ? dto.seoTitle ?? null : product.seoTitle,
      seoDescription:    dto.seoDescription     !== undefined ? dto.seoDescription ?? null : product.seoDescription,
      canonicalUrl:      dto.canonicalUrl       !== undefined ? dto.canonicalUrl ?? null : product.canonicalUrl,
      featured:          dto.featured           !== undefined ? dto.featured : product.featured,
      status:            dto.status             ?? product.status,
      primaryCategoryId: dto.primaryCategoryId  !== undefined ? dto.primaryCategoryId ?? null : product.primaryCategoryId,
      basePriceCents:    dto.basePriceCents      !== undefined ? dto.basePriceCents ?? null : product.basePriceCents,
    });

    if (dto.categoryIds !== undefined) {
      product.categories = dto.categoryIds.length
        ? await this.categoryRepo.find({ where: { id: In(dto.categoryIds) } })
        : [];
    }
    if (dto.tagIds !== undefined) {
      product.tags = dto.tagIds.length
        ? await this.tagRepo.find({ where: { id: In(dto.tagIds) } })
        : [];
    }

    await this.productRepo.save(product);

    // When basePriceCents is explicitly set, clear per-variant price overrides so all
    // variants fall through to the new base price (computed pricing model). Legacy products
    // created before basePriceCents existed store an explicit priceCents on each variant,
    // which wins over basePriceCents in resolveVariantPrice — causing admin price edits to
    // have no visible effect on the storefront.
    if (dto.basePriceCents !== undefined && dto.basePriceCents !== null) {
      await this.variantRepo.update({ productId: id }, { priceCents: null });
    }

    // Keep the default variant's compareAtPriceCents in sync when provided
    if (dto.compareAtPriceCents !== undefined) {
      await this.variantRepo.update(
        { productId: id, isDefault: true },
        { compareAtPriceCents: dto.compareAtPriceCents ?? null },
      );
    }

    this.scheduleIndex(product);
    this.syncProductMediaUsage(product);
    return this.findById(id);
  }

  // ── Publish / archive ───────────────────────────────────────────────────────

  async publish(id: string): Promise<Product> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    product.status = 'active';
    product.publishedAt = product.publishedAt ?? new Date();
    await this.productRepo.save(product);
    this.scheduleIndex(product);
    return this.findById(id);
  }

  async archive(id: string): Promise<Product> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) throw new NotFoundException('Product not found');
    product.status = 'archived';
    await this.productRepo.save(product);
    this.scheduleIndex(product);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.productRepo.softDelete(id);
    this.searchService?.removeFromIndex(id).catch(() => {});
  }

  async hardDelete(id: string): Promise<void> {
    await this.productRepo.delete(id);
    this.searchService?.removeFromIndex(id).catch(() => {});
  }

  async restore(id: string): Promise<any> {
    await this.productRepo.restore(id);
    return this.findById(id);
  }

  // ── Variants ────────────────────────────────────────────────────────────────

  // ── Private variant helpers ────────────────────────────────────────────────

  /**
   * Resolves and validates option value IDs.
   * Returns values sorted by their attribute's sortOrder for deterministic
   * title / slug / hash generation.
   */
  private async resolveOptionValues(optionValueIds: string[]): Promise<VariationOptionValue[]> {
    if (!optionValueIds.length) return [];
    const rows = await this.optionValueRepo.find({
      where: { id: In(optionValueIds) },
      relations: ['attribute'],
    });
    if (rows.length !== optionValueIds.length) {
      throw new BadRequestException('One or more option value IDs are invalid');
    }
    const attrIds = rows.map(r => r.attributeId);
    if (new Set(attrIds).size !== attrIds.length) {
      throw new BadRequestException('Duplicate attributes in variant options');
    }
    // Sort by attribute.sortOrder for deterministic output
    return rows.sort((a, b) =>
      ((a.attribute as VariantAttribute).sortOrder ?? 0) -
      ((b.attribute as VariantAttribute).sortOrder ?? 0),
    );
  }

  /** Throws ConflictException if combinationHash already exists for another variant of this product. */
  private async checkCombinationUniqueness(
    productId: string, hash: string | null, excludeVariantId?: string,
  ): Promise<void> {
    if (!hash) return;
    const existing = await this.variantRepo.findOneBy({ productId, combinationHash: hash });
    if (existing && existing.id !== excludeVariantId) {
      throw new ConflictException('A variant with this combination of options already exists');
    }
  }

  /** Finds a unique SKU by appending a counter suffix when needed. */
  private async generateUniqueVariantSku(
    base: string, em: EntityManager, excludeId?: string,
  ): Promise<string> {
    let sku = base.slice(0, 200);
    let n   = 2;
    while (true) {
      const hit = await em.findOneBy(ProductVariant, { sku });
      if (!hit || hit.id === excludeId) return sku;
      sku = `${base.slice(0, 196)}-${n++}`;
    }
  }

  /** Finds a unique variantSlug per product by appending a counter suffix when needed. */
  private async generateUniqueVariantSlug(
    productId: string, base: string | null, em: EntityManager, excludeId?: string,
  ): Promise<string | null> {
    if (!base) return null;
    let slug = base.slice(0, 300);
    let n    = 2;
    while (true) {
      const hit = await em.findOneBy(ProductVariant, { productId, variantSlug: slug });
      if (!hit || hit.id === excludeId) return slug;
      slug = `${base.slice(0, 296)}-${n++}`;
    }
  }

  /** Persists VariantOption rows and syncs the product-level attribute scoping table. */
  private async saveVariantOptions(
    variantId: string, productId: string,
    optionValues: VariationOptionValue[], em: EntityManager,
  ): Promise<void> {
    for (const ov of optionValues) {
      await em.save(VariantOption, em.create(VariantOption, {
        variantId,
        attributeId:   ov.attributeId,
        optionValueId: ov.id,
        value:         ov.value,
      }));
      await em.query(
        `INSERT INTO "shop_product_variant_attributes" ("productId", "attributeId", "sortOrder")
         VALUES ($1, $2, 0)
         ON CONFLICT ("productId", "attributeId") DO NOTHING`,
        [productId, ov.attributeId],
      );
    }
  }

  // ── Variant CRUD ──────────────────────────────────────────────────────────

  async addVariant(productId: string, dto: CreateVariantDto): Promise<ProductVariant> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.sku) {
      const conflict = await this.variantRepo.findOneBy({ sku: dto.sku });
      if (conflict) throw new ConflictException(`SKU "${dto.sku}" already in use`);
    }

    const optionValues    = await this.resolveOptionValues((dto.options ?? []).map(o => o.optionValueId));
    const combinationHash = buildCombinationHash(optionValues.map(v => v.id));
    await this.checkCombinationUniqueness(productId, combinationHash);

    return this.dataSource.transaction(async (em) => {
      const sku         = dto.sku         ?? await this.generateUniqueVariantSku(buildVariantSkuBase(product, optionValues), em);
      const title       = dto.title       ?? (optionValues.length ? buildVariantTitle(optionValues) : sku);
      const variantSlug = await this.generateUniqueVariantSlug(productId, buildVariantSlug(optionValues), em);

      const saved = await em.save(ProductVariant, em.create(ProductVariant, {
        productId,
        sku,
        title,
        combinationHash,
        variantSlug,
        priceCents:          dto.priceCents ?? null,
        compareAtPriceCents: dto.compareAtPriceCents ?? null,
        barcode:             dto.barcode ?? null,
        weightGrams:         dto.weightGrams ?? null,
        mediaKeys:           dto.mediaKeys ?? [],
        featuredMediaKey:    dto.featuredMediaKey ?? null,
        isDefault:           dto.isDefault ?? false,
        sortOrder:           dto.sortOrder ?? 0,
      }));

      await this.saveVariantOptions(saved.id, productId, optionValues, em);

      await em.save(InventoryItem, em.create(InventoryItem, {
        variantId: saved.id,
        productId,
        available: dto.initialStock ?? 0,
      }));

      return em.findOne(ProductVariant, {
        where: { id: saved.id },
        relations: ['options', 'options.optionValue', 'options.attribute'],
      }) as Promise<ProductVariant>;
    });
  }

  // ── Auto-generate all variant combinations from linked attributes ────────────

  async generateVariantCombinations(productId: string): Promise<{
    created: number;
    skipped: number;
    deleted: number;
    combinations: Array<{ title: string; sku: string; isNew: boolean; combinationHash: string }>;
  }> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    const productAttrs = await this.productAttrRepo.find({
      where: { productId },
      relations: ['attribute', 'attribute.optionValues'],
      order: { sortOrder: 'ASC' },
    });
    if (!productAttrs.length) throw new BadRequestException('Product has no linked variation attributes');

    const axes = productAttrs.map(pa => ({
      attribute:          pa.attribute,
      defaultOptionValueId: pa.defaultOptionValueId,
      optionValues: [...pa.attribute.optionValues]
        .filter(ov => ov.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    if (axes.some(ax => ax.optionValues.length === 0)) {
      throw new BadRequestException('One or more attributes have no active option values');
    }

    // Default combination = the hash of the admin-selected defaultOptionValueId per attribute.
    // Falls back to null when any attribute has no default configured.
    const defaultIds = axes.map(ax => ax.defaultOptionValueId).filter(Boolean) as string[];
    const defaultHash = defaultIds.length === axes.length
      ? buildCombinationHash(defaultIds)
      : null;

    // Cartesian product
    const allCombos: VariationOptionValue[][] = axes.reduce<VariationOptionValue[][]>(
      (acc, ax) => acc.flatMap(a => ax.optionValues.map(ov => [...a, ov])),
      [[]],
    );

    let created = 0;
    let skipped = 0;
    let sortOrder = await this.variantRepo.countBy({ productId });
    const combinations: Array<{ title: string; sku: string; isNew: boolean; combinationHash: string }> = [];

    // When the product has a basePriceCents, generated variants use null (computed pricing).
    // Legacy products without basePriceCents fall back to copying the first variant's explicit price.
    const existingVariant = await this.variantRepo.findOne({
      where: { productId },
      order: { createdAt: 'ASC' },
    });
    const generatedVariantPrice: number | null = product.basePriceCents !== null
      ? null
      : (existingVariant?.priceCents ?? 0);

    for (const optionValues of allCombos) {
      const hash = buildCombinationHash(optionValues.map(v => v.id));
      if (!hash) continue;

      const isDefault = defaultHash !== null && hash === defaultHash;

      const existing = await this.variantRepo.findOneBy({ productId, combinationHash: hash });
      if (existing) {
        // Sync isDefault in case the admin changed defaultOptionValueId after initial generation.
        if (defaultHash !== null && existing.isDefault !== isDefault) {
          await this.variantRepo.update(existing.id, { isDefault });
        }
        skipped++;
        combinations.push({ title: existing.title, sku: existing.sku, isNew: false, combinationHash: hash });
        continue;
      }

      await this.dataSource.transaction(async (em) => {
        const sku         = await this.generateUniqueVariantSku(buildVariantSkuBase(product, optionValues), em);
        const title       = buildVariantTitle(optionValues);
        const variantSlug = await this.generateUniqueVariantSlug(productId, buildVariantSlug(optionValues), em);

        const saved = await em.save(ProductVariant, em.create(ProductVariant, {
          productId,
          sku,
          title,
          combinationHash: hash,
          variantSlug,
          priceCents:  generatedVariantPrice,
          isDefault,
          sortOrder:   sortOrder++,
        }));

        await this.saveVariantOptions(saved.id, productId, optionValues, em);

        await em.save(InventoryItem, em.create(InventoryItem, {
          variantId: saved.id,
          productId,
          available: 0,
        }));

        created++;
        combinations.push({ title, sku, isNew: true, combinationHash: hash });
      });
    }

    // If a default hash was resolved, ensure no other variant for this product is marked default.
    if (defaultHash !== null) {
      await this.variantRepo.query(
        `UPDATE shop_product_variants
         SET "isDefault" = CASE WHEN "combinationHash" = $1 THEN true ELSE false END
         WHERE "productId" = $2`,
        [defaultHash, productId],
      );
    }

    // Delete stale variants — those whose hash is not in the current full valid set.
    // The original default variant (null combinationHash) is preserved so it can
    // be restored when all variation attributes are removed from the product.
    const validHashes = new Set(
      allCombos.map(ovs => buildCombinationHash(ovs.map(v => v.id))).filter(Boolean) as string[],
    );
    const allVariants = await this.variantRepo.find({
      where: { productId },
      select: ['id', 'combinationHash'],
    });
    const staleIds = allVariants
      .filter(v => v.combinationHash && !validHashes.has(v.combinationHash))
      .map(v => v.id);

    let deleted = 0;
    if (staleIds.length > 0) {
      await this.inventoryRepo.delete({ variantId: In(staleIds) });
      await this.variantRepo.delete({ id: In(staleIds) });
      deleted = staleIds.length;
    }

    return { created, skipped, deleted, combinations };
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({ where: { id: variantId }, relations: ['options'] });
    if (!variant) throw new NotFoundException('Variant not found');

    if (dto.sku && dto.sku !== variant.sku) {
      const conflict = await this.variantRepo.findOneBy({ sku: dto.sku });
      if (conflict && conflict.id !== variantId) throw new ConflictException('SKU already in use');
    }

    const optionValues = dto.options !== undefined
      ? await this.resolveOptionValues(dto.options?.map(o => o.optionValueId) ?? [])
      : null;

    if (optionValues !== null) {
      const newHash = buildCombinationHash(optionValues.map(v => v.id));
      await this.checkCombinationUniqueness(variant.productId, newHash, variantId);
    }

    return this.dataSource.transaction(async (em) => {
      const combinationHash = optionValues !== null ? buildCombinationHash(optionValues.map(v => v.id)) : variant.combinationHash;
      const variantSlug     = optionValues !== null
        ? await this.generateUniqueVariantSlug(variant.productId, buildVariantSlug(optionValues), em, variantId)
        : variant.variantSlug;

      // Auto-update title only when options explicitly changed and no manual title given
      const title = dto.title
        ?? (optionValues !== null && optionValues.length ? buildVariantTitle(optionValues) : variant.title);

      const sku = dto.sku ?? variant.sku;
      const finalSku = (sku !== variant.sku)
        ? await this.generateUniqueVariantSku(sku, em, variantId)
        : sku;

      Object.assign(variant, {
        sku:                 finalSku,
        title,
        combinationHash,
        variantSlug,
        priceCents:          dto.priceCents           !== undefined ? dto.priceCents ?? null : variant.priceCents,
        compareAtPriceCents: dto.compareAtPriceCents  !== undefined ? dto.compareAtPriceCents ?? null : variant.compareAtPriceCents,
        barcode:             dto.barcode             !== undefined ? dto.barcode ?? null : variant.barcode,
        weightGrams:         dto.weightGrams         !== undefined ? dto.weightGrams ?? null : variant.weightGrams,
        mediaKeys:           dto.mediaKeys           ?? variant.mediaKeys,
        featuredMediaKey:    dto.featuredMediaKey    !== undefined ? dto.featuredMediaKey ?? null : variant.featuredMediaKey,
        isDefault:           dto.isDefault           !== undefined ? dto.isDefault : variant.isDefault,
        sortOrder:           dto.sortOrder           !== undefined ? dto.sortOrder : variant.sortOrder,
      });
      await em.save(ProductVariant, variant);

      if (optionValues !== null) {
        await em.delete(VariantOption, { variantId });
        await this.saveVariantOptions(variantId, variant.productId, optionValues, em);
      }

      return em.findOne(ProductVariant, {
        where: { id: variantId },
        relations: ['options', 'options.optionValue', 'options.attribute'],
      }) as Promise<ProductVariant>;
    });
  }

  async deleteVariant(variantId: string): Promise<void> {
    const variant = await this.variantRepo.findOneBy({ id: variantId });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.variantRepo.remove(variant);
  }

  // ── Product-level attribute scoping ────────────────────────────────────────

  async getProductAttributes(productId: string): Promise<ProductVariantAttribute[]> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');
    return this.productAttrRepo.find({
      where: { productId },
      relations: ['attribute', 'attribute.optionValues'],
      order: { sortOrder: 'ASC' },
    });
  }

  async addProductAttribute(
    productId: string,
    attributeId: string,
    defaultOptionValueId?: string | null,
    sortOrder = 0,
  ): Promise<ProductVariantAttribute> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');
    const existing = await this.productAttrRepo.findOneBy({ productId, attributeId });
    if (existing) throw new ConflictException('Attribute already assigned to this product');
    const row = this.productAttrRepo.create({ productId, attributeId, sortOrder, defaultOptionValueId: defaultOptionValueId ?? null });
    return this.productAttrRepo.save(row);
  }

  async updateProductAttribute(
    productId: string,
    attributeId: string,
    defaultOptionValueId: string | null,
  ): Promise<ProductVariantAttribute> {
    const row = await this.productAttrRepo.findOneBy({ productId, attributeId });
    if (!row) throw new NotFoundException('Attribute not linked to this product');
    row.defaultOptionValueId = defaultOptionValueId;
    return this.productAttrRepo.save(row);
  }

  async removeProductAttribute(productId: string, attributeId: string): Promise<{ deletedVariants: number }> {
    return this.dataSource.transaction(async (em) => {
      // Find all variants of this product that have an option from the removed attribute
      const rows: { variantId: string }[] = await em.query(
        `SELECT DISTINCT vo."variantId"
         FROM shop_variant_options vo
         INNER JOIN shop_product_variants pv ON pv.id = vo."variantId"
         WHERE pv."productId" = $1 AND vo."attributeId" = $2`,
        [productId, attributeId],
      );
      const variantIds = rows.map(r => r.variantId);

      if (variantIds.length > 0) {
        // Delete inventory items first — no FK cascade from ProductVariant
        await em.delete(InventoryItem, { variantId: In(variantIds) });
        // Delete variants — VariantOptions cascade automatically via FK
        await em.delete(ProductVariant, { id: In(variantIds) });
      }

      await em.delete(ProductVariantAttribute, { productId, attributeId });

      // When only the original default variant remains (null combinationHash),
      // re-mark it as the default so the product works as a simple product again.
      const remaining = await em.find(ProductVariant, {
        where: { productId },
        select: ['id', 'combinationHash', 'isDefault'],
      });
      const original = remaining.find(v => !v.combinationHash);
      if (original && remaining.length === 1 && !original.isDefault) {
        original.isDefault = true;
        await em.save(ProductVariant, original);
      }

      return { deletedVariants: variantIds.length };
    });
  }

  // ── Per-product images for "image" swatch option values ─────────────────────

  async getProductOptionImages(productId: string): Promise<Array<{ optionValueId: string; mediaKey: string; url: string | null }>> {
    const rows = await this.optionImageRepo.findBy({ productId });
    if (!rows.length) return [];
    const urlMap = await this.assetUrlService.resolveBatch(rows.map(r => r.mediaKey));
    return rows.map(r => ({
      optionValueId: r.optionValueId,
      mediaKey:      r.mediaKey,
      url:           urlMap.get(r.mediaKey) ?? null,
    }));
  }

  async setProductOptionImage(
    productId: string, optionValueId: string, mediaKey: string,
  ): Promise<{ optionValueId: string; mediaKey: string; url: string | null }> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    const optionValue = await this.optionValueRepo.findOneBy({ id: optionValueId });
    if (!optionValue) throw new BadRequestException('Option value not found');

    const linked = await this.productAttrRepo.findOneBy({ productId, attributeId: optionValue.attributeId });
    if (!linked) throw new BadRequestException('This option value\'s attribute is not linked to this product');

    let row = await this.optionImageRepo.findOneBy({ productId, optionValueId });
    if (row) row.mediaKey = mediaKey;
    else row = this.optionImageRepo.create({ productId, optionValueId, mediaKey });
    await this.optionImageRepo.save(row);

    const url = await this.assetUrlService.resolve(mediaKey);
    return { optionValueId, mediaKey, url };
  }

  async removeProductOptionImage(productId: string, optionValueId: string): Promise<void> {
    await this.optionImageRepo.delete({ productId, optionValueId });
  }

  // ── Variant resolution (PDP option picker → specific SKU) ──────────────────

  async resolveVariant(
    productId: string,
    optionValueIds: string[],
  ): Promise<{
    status: 'available' | 'out_of_stock' | 'unavailable';
    variant: {
      id: string; sku: string; title: string;
      priceCents: number; compareAtPriceCents: number | null;
      variantSlug: string | null; featuredMediaUrl: string | null;
      available: number; optionValueIds: string[];
    } | null;
  }> {
    if (!optionValueIds.length) return { status: 'unavailable', variant: null };

    const hash = buildCombinationHash(optionValueIds);
    if (!hash) return { status: 'unavailable', variant: null };

    const [variant, product] = await Promise.all([
      this.variantRepo.findOne({
        where: { productId, combinationHash: hash },
        relations: ['options', 'options.optionValue'],
      }),
      this.productRepo.findOneBy({ id: productId }),
    ]);
    if (!variant) return { status: 'unavailable', variant: null };

    const inventory   = await this.inventoryRepo.findOneBy({ variantId: variant.id });
    const hasInventory = !!inventory;
    const available   = hasInventory ? (inventory!.available ?? 0) : -1;

    const featuredMediaUrl = variant.featuredMediaKey
      ? ((await this.assetUrlService.resolveBatch([variant.featuredMediaKey])).get(variant.featuredMediaKey) ?? null)
      : null;

    const effectivePriceCents = resolveVariantPrice({
      variantPriceCents:     variant.priceCents,
      basePriceCents:        product?.basePriceCents ?? null,
      optionAdjustmentCents: sumOptionAdjustments(variant.options ?? []),
    });

    return {
      status:  !hasInventory || available > 0 ? 'available' : 'out_of_stock',
      variant: {
        id:                  variant.id,
        sku:                 variant.sku,
        title:               variant.title,
        priceCents:          effectivePriceCents,
        compareAtPriceCents: variant.compareAtPriceCents ?? null,
        variantSlug:         variant.variantSlug ?? null,
        featuredMediaUrl,
        available,
        optionValueIds:      (variant.options ?? []).map(o => o.optionValueId).filter(Boolean) as string[],
      },
    };
  }

  async getVariantStock(variantId: string): Promise<{ available: number; inStock: boolean }> {
    const inventory = await this.inventoryRepo.findOneBy({ variantId });
    if (!inventory) return { available: -1, inStock: true };
    return { available: inventory.available, inStock: inventory.available > 0 };
  }

  // ── Variant availability matrix (PDP option picker state) ──────────────────

  /**
   * Returns all variants with their option combinations and stock levels.
   * The frontend uses this to disable unavailable option choices and
   * resolve which variant is selected given current option picks.
   */
  async getVariantAvailabilityMatrix(productId: string, lang?: string): Promise<{
    attributes: Array<{
      id: string; name: string; slug: string;
      displayType: 'swatch' | 'button' | 'dropdown'; sortOrder: number;
      defaultOptionValueId: string | null;
      optionValues: Array<{
        id: string; value: string; displayValue: string | null;
        swatchValue: string | null; swatchType: 'color' | 'image' | null; sortOrder: number;
      }>;
    }>;
    variants: Array<{
      id: string; sku: string; title: string;
      priceCents: number; compareAtPriceCents: number | null;
      variantSlug: string | null; featuredMediaUrl: string | null;
      optionValueIds: string[];
      available: number; inStock: boolean;
    }>;
  }> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    // Source attributes from the product's linked variations (not from existing variants)
    const productAttrs = await this.productAttrRepo.find({
      where: { productId },
      relations: ['attribute', 'attribute.optionValues'],
      order: { sortOrder: 'ASC' },
    });

    let variants = await this.variantRepo.find({
      where: { productId },
      relations: ['options', 'options.optionValue'],
    });

    // Exclude the preserved original default variant (null combinationHash)
    // when variation attributes exist — it shouldn't appear in the option picker.
    if (productAttrs.length > 0) {
      variants = variants.filter(v => v.combinationHash !== null);
    }

    const inventoryRows = await this.inventoryRepo.findBy({ productId });
    const hasInventory  = inventoryRows.length > 0;
    const stockMap      = new Map(inventoryRows.map(i => [i.variantId, i.available]));

    const mediaKeys = variants.map(v => v.featuredMediaKey).filter(Boolean) as string[];
    // Image swatches are per-product (Product A's "Red" photo isn't Product B's),
    // so resolve them from this product's option-value image overrides.
    const optionImages    = await this.optionImageRepo.findBy({ productId });
    const optionImageMap  = new Map(optionImages.map(oi => [oi.optionValueId, oi.mediaKey]));
    const swatchKeys      = [...optionImageMap.values()];
    const urlMap = await this.assetUrlService.resolveBatch([...mediaKeys, ...swatchKeys]);

    let attributes: any[] = productAttrs.map(pa => ({
      id:                   pa.attribute.id,
      name:                 pa.attribute.name,
      slug:                 pa.attribute.slug,
      displayType:          pa.attribute.displayType,
      sortOrder:            pa.sortOrder,
      defaultOptionValueId: pa.defaultOptionValueId,
      optionValues: [...pa.attribute.optionValues]
        .filter(ov => ov.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(ov => ({
          id:           ov.id,
          value:        ov.value,
          displayValue: ov.displayValue,
          // Color swatches are a global hex value; image swatches are per-product
          // (see optionImageMap) so the global swatchValue is not exposed here.
          swatchValue:  ov.swatchType === 'color' ? ov.swatchValue : null,
          swatchUrl:    ov.swatchType === 'image'
                          ? (urlMap.get(optionImageMap.get(ov.id) ?? '') ?? null)
                          : null,          // signed URL — used by frontend for CSS background display
          swatchType:   ov.swatchType,
          sortOrder:    ov.sortOrder,
        })),
    }));

    attributes = await this.translationsService.maybeApply(attributes, ET_SHOP_VARIANT_ATTR, lang);
    for (const attr of attributes) {
      if (attr.optionValues?.length) {
        attr.optionValues = await this.translationsService.maybeApply(
          attr.optionValues, ET_SHOP_VARIATION_OPTION, lang,
        );
      }
    }

    return {
      attributes,
      variants: variants.map(v => ({
        id:                  v.id,
        sku:                 v.sku,
        title:               v.title,
        priceCents:          resolveVariantPrice({
          variantPriceCents:     v.priceCents,
          basePriceCents:        product.basePriceCents,
          optionAdjustmentCents: sumOptionAdjustments(v.options ?? []),
        }),
        compareAtPriceCents: v.compareAtPriceCents,
        variantSlug:         v.variantSlug,
        featuredMediaUrl:    v.featuredMediaKey ? (urlMap.get(v.featuredMediaKey) ?? null) : null,
        optionValueIds:      (v.options ?? []).map(o => o.optionValueId).filter(Boolean) as string[],
        available:           hasInventory ? (stockMap.get(v.id) ?? 0) : 1,
        inStock:             !hasInventory || (stockMap.get(v.id) ?? 0) > 0,
      })),
    };
  }

  /** Finds a variant by its URL slug within a product. */
  async getVariantBySlug(productId: string, variantSlug: string): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { productId, variantSlug },
      relations: ['options', 'options.optionValue', 'options.attribute'],
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  async getCategories(): Promise<any[]> {
    const cats = await this.categoryRepo.find({ order: { name: 'ASC' } });
    if (!cats.length) return cats;
    const ids = cats.map(c => c.id);
    const rows: Array<{ entityId: string; field: string; lang: string; value: string }> =
      await this.dataSource.query(
        `SELECT "entityId", field, lang, value FROM translations
         WHERE "entityType" = 'shop_product_category' AND "entityId" = ANY($1)`,
        [ids],
      );
    const txMap = new Map<string, Record<string, Record<string, string>>>();
    for (const r of rows) {
      if (!txMap.has(r.entityId)) txMap.set(r.entityId, {});
      const m = txMap.get(r.entityId)!;
      if (!m[r.field]) m[r.field] = {};
      m[r.field][r.lang] = r.value;
    }
    return cats.map(c => ({ ...c, translations: txMap.get(c.id) ?? {} }));
  }

  async getTags(): Promise<ProductTag[]> {
    return this.tagRepo.find({ order: { name: 'ASC' } });
  }

  // ── Translation helpers ─────────────────────────────────────────────────────

  private async saveCategoryTranslations(
    entityId: string,
    translations: Record<string, Record<string, string>>,
  ): Promise<void> {
    for (const [field, langs] of Object.entries(translations)) {
      for (const [lang, value] of Object.entries(langs)) {
        if (!value) continue;
        await this.dataSource.query(
          `INSERT INTO translations ("entityType", "entityId", field, lang, value)
           VALUES ('shop_product_category', $1, $2, $3, $4)
           ON CONFLICT ("entityType", "entityId", field, lang)
           DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
          [entityId, field, lang, value],
        );
      }
    }
  }

  // ── Category CRUD ───────────────────────────────────────────────────────────

  async createCategory(dto: {
    name: string; slug: string; description?: string | null;
    parentId?: string | null; imageKey?: string | null;
    seoTitle?: string | null; seoDescription?: string | null;
    sortOrder?: number; isActive?: boolean;
    translations?: Record<string, Record<string, string>>;
  }): Promise<any> {
    const existing = await this.categoryRepo.findOneBy({ slug: dto.slug });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" already in use`);
    const { translations, ...fields } = dto;
    const saved = await this.categoryRepo.save(this.categoryRepo.create(fields));
    if (translations) await this.saveCategoryTranslations(saved.id, translations);
    return { ...saved, translations: translations ?? {} };
  }

  async updateCategory(id: string, dto: Partial<{
    name: string; slug: string; description: string | null;
    parentId: string | null; imageKey: string | null;
    seoTitle: string | null; seoDescription: string | null;
    sortOrder: number; isActive: boolean;
    translations: Record<string, Record<string, string>>;
  }>): Promise<any> {
    const cat = await this.categoryRepo.findOneBy({ id });
    if (!cat) throw new NotFoundException('Category not found');
    if (dto.slug && dto.slug !== cat.slug) {
      const conflict = await this.categoryRepo.findOneBy({ slug: dto.slug });
      if (conflict) throw new ConflictException('Slug already in use');
    }
    const { translations, ...fields } = dto;
    Object.assign(cat, fields);
    const saved = await this.categoryRepo.save(cat);
    if (translations) await this.saveCategoryTranslations(id, translations);
    return { ...saved, translations: translations ?? {} };
  }

  async deleteCategory(id: string): Promise<void> {
    const cat = await this.categoryRepo.findOneBy({ id });
    if (!cat) throw new NotFoundException('Category not found');
    await this.dataSource.query(
      `DELETE FROM translations WHERE "entityType" = 'shop_product_category' AND "entityId" = $1`,
      [id],
    );
    await this.categoryRepo.remove(cat);
  }
}
