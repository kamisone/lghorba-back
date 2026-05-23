import {
  ConflictException, Injectable, Logger, NotFoundException, Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { z } from 'zod';
import { Product } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { InventoryItem } from '../entities/inventory-item.entity';
import { ProductCategory } from '../entities/product-category.entity';
import { ProductTag } from '../entities/product-tag.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { MediaService } from '../../media/media.service';
import { ProductSearchService } from './product-search.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_PRODUCT } from '../shared/entity-types';

// ── Schemas ────────────────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  title:              z.string().min(1).max(500),
  slug:               z.string().min(1).max(300).optional(),
  sku:                z.string().max(200).nullish(),
  shortDescription:   z.string().nullish(),
  description:        z.string().nullish(),
  brand:              z.string().max(300).nullish(),
  specifications:     z.record(z.string(), z.unknown()).nullish(),
  featuredImageKey:   z.string().max(1000).nullish(),
  galleryImageKeys:   z.array(z.string().max(1000)).optional(),
  seoTitle:           z.string().max(500).nullish(),
  seoDescription:     z.string().nullish(),
  canonicalUrl:       z.string().max(2000).nullish(),
  featured:           z.boolean().optional(),
  primaryCategoryId:  z.string().uuid().nullish(),
  categoryIds:        z.array(z.string().uuid()).optional(),
  tagIds:             z.array(z.string().uuid()).optional(),
  // Initial default variant
  priceCents:         z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).nullish(),
  initialStock:       z.number().int().min(0).optional(),
});

export const UpdateProductSchema = CreateProductSchema.omit({ priceCents: true, initialStock: true }).extend({
  priceCents:  z.number().int().min(0).optional(),
  status:      z.enum(['draft', 'active', 'archived', 'hidden']).optional(),
}).partial();

export const CreateVariantSchema = z.object({
  sku:                z.string().min(1).max(200),
  title:              z.string().min(1).max(500),
  priceCents:         z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).nullish(),
  barcode:            z.string().max(200).nullish(),
  weightGrams:        z.number().int().nullish(),
  mediaKeys:          z.array(z.string().max(1000)).optional(),
  isDefault:          z.boolean().optional(),
  sortOrder:          z.number().int().optional(),
  initialStock:       z.number().int().min(0).optional(),
  options:            z.array(z.object({ attributeId: z.string().uuid(), value: z.string().max(200) })).optional(),
});

export type CreateProductDto   = z.infer<typeof CreateProductSchema>;
export type UpdateProductDto   = z.infer<typeof UpdateProductSchema>;
export type CreateVariantDto   = z.infer<typeof CreateVariantSchema>;

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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)         private readonly productRepo:   Repository<Product>,
    @InjectRepository(ProductVariant)  private readonly variantRepo:   Repository<ProductVariant>,
    @InjectRepository(InventoryItem)   private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(ProductCategory) private readonly categoryRepo:  Repository<ProductCategory>,
    @InjectRepository(ProductTag)      private readonly tagRepo:       Repository<ProductTag>,
    private readonly assetUrlService:  AssetUrlService,
    private readonly dataSource:       DataSource,
    @Optional() private readonly searchService: ProductSearchService,
    @Optional() private readonly mediaService: MediaService,
    @Optional() private readonly translationsService: TranslationsService,
  ) {}

  private syncProductMediaUsage(product: Product): void {
    if (!this.mediaService) return;
    const keys: Array<{ key: string; field: string }> = [];
    if (product.featuredImageKey) keys.push({ key: product.featuredImageKey, field: 'featuredImageKey' });
    for (const k of product.galleryImageKeys ?? []) keys.push({ key: k, field: 'galleryImageKeys' });
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

  // Resolves featured + gallery + all variant media keys in one Redis batch.
  private async resolveProductUrls<T extends Product>(product: T): Promise<T & {
    featuredImageUrl:  string | null;
    galleryImageUrls:  string[];
  }> {
    const variants = (product as any).variants as Array<{ mediaKeys?: string[]; mediaUrls?: string[] }> | undefined;

    const allKeys = new Set<string>();
    if (product.featuredImageKey)        allKeys.add(product.featuredImageKey);
    for (const k of product.galleryImageKeys ?? []) allKeys.add(k);
    if (variants) {
      for (const v of variants) for (const k of v.mediaKeys ?? []) allKeys.add(k);
    }

    const urlMap = allKeys.size ? await this.assetUrlService.resolveBatch([...allKeys]) : new Map<string, string>();

    if (variants) {
      for (const v of variants) {
        v.mediaUrls = (v.mediaKeys ?? []).map(k => urlMap.get(k)).filter(Boolean) as string[];
      }
    }

    return Object.assign(product, {
      featuredImageUrl: product.featuredImageKey ? (urlMap.get(product.featuredImageKey) ?? null) : null,
      galleryImageUrls: (product.galleryImageKeys ?? []).map(k => urlMap.get(k)).filter(Boolean) as string[],
    });
  }

  // List resolution: only featured image needed for product cards.
  private async resolveProductsUrls<T extends Product>(products: T[]): Promise<(T & { featuredImageUrl: string | null })[]> {
    if (!products.length) return [];
    const keys = products.map(p => p.featuredImageKey).filter(Boolean) as string[];
    const urlMap = keys.length ? await this.assetUrlService.resolveBatch(keys) : new Map<string, string>();
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
    if (search) qb.andWhere('p.title ILIKE :q', { q: `%${search}%` });

    const [raw, total] = await qb.getManyAndCount();
    let withUrls = await this.resolveProductsUrls(raw) as any[];
    if (lang && this.translationsService) {
      withUrls = await this.translationsService.applyToEntities(withUrls, ET_SHOP_PRODUCT, lang);
    }
    return { items: withUrls, total };
  }

  // ── Find by ID (admin) ──────────────────────────────────────────────────────

  async findById(id: string): Promise<any> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['categories', 'tags', 'variants', 'variants.options', 'primaryCategory'],
      withDeleted: true,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.resolveProductUrls(product);
  }

  // ── Find by slug (public) ───────────────────────────────────────────────────

  async findBySlug(slug: string, lang?: string): Promise<any> {
    const product = await this.productRepo.findOne({
      where: { slug, status: 'active' },
      relations: ['categories', 'tags', 'variants', 'variants.options', 'primaryCategory'],
    });
    if (!product) throw new NotFoundException('Product not found');
    let result: any = await this.resolveProductUrls(product);
    if (lang && this.translationsService) {
      result = await this.translationsService.applyToEntity(result, ET_SHOP_PRODUCT, lang);
    }
    return result;
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

      const product = em.create(Product, {
        slug,
        title:             dto.title,
        sku:               dto.sku ?? null,
        shortDescription:  dto.shortDescription ?? null,
        description:       dto.description ?? null,
        brand:             dto.brand ?? null,
        specifications:    (dto.specifications as Record<string, string>) ?? null,
        featuredImageKey:  dto.featuredImageKey ?? null,
        galleryImageKeys:  dto.galleryImageKeys ?? [],
        seoTitle:          dto.seoTitle ?? null,
        seoDescription:    dto.seoDescription ?? null,
        canonicalUrl:      dto.canonicalUrl ?? null,
        featured:          dto.featured ?? false,
        status:            'draft',
        primaryCategoryId: dto.primaryCategoryId ?? null,
        categories,
        tags,
      });
      const saved = await em.save(Product, product);

      const variant = em.create(ProductVariant, {
        productId:           saved.id,
        sku:                 dto.sku ?? `${slug}-default`,
        title:               'Default',
        priceCents:          dto.priceCents,
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

    Object.assign(product, {
      title:             dto.title              ?? product.title,
      sku:               dto.sku                !== undefined ? dto.sku ?? null : product.sku,
      shortDescription:  dto.shortDescription   !== undefined ? dto.shortDescription ?? null : product.shortDescription,
      description:       dto.description        !== undefined ? dto.description ?? null : product.description,
      brand:             dto.brand              !== undefined ? dto.brand ?? null : product.brand,
      specifications:    dto.specifications     !== undefined ? dto.specifications ?? null : product.specifications,
      featuredImageKey:  dto.featuredImageKey   !== undefined ? dto.featuredImageKey ?? null : product.featuredImageKey,
      galleryImageKeys:  dto.galleryImageKeys   ?? product.galleryImageKeys,
      seoTitle:          dto.seoTitle           !== undefined ? dto.seoTitle ?? null : product.seoTitle,
      seoDescription:    dto.seoDescription     !== undefined ? dto.seoDescription ?? null : product.seoDescription,
      canonicalUrl:      dto.canonicalUrl       !== undefined ? dto.canonicalUrl ?? null : product.canonicalUrl,
      featured:          dto.featured           !== undefined ? dto.featured : product.featured,
      status:            dto.status             ?? product.status,
      primaryCategoryId: dto.primaryCategoryId  !== undefined ? dto.primaryCategoryId ?? null : product.primaryCategoryId,
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
    this.scheduleIndex(product);
    this.syncProductMediaUsage(product);
    // Reload with all relations + resolved URLs so the response matches findById
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

  async addVariant(productId: string, dto: CreateVariantDto): Promise<ProductVariant> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.variantRepo.findOneBy({ sku: dto.sku });
    if (existing) throw new ConflictException(`SKU "${dto.sku}" already in use`);

    return this.dataSource.transaction(async (em) => {
      const variant = em.create(ProductVariant, {
        productId,
        sku:                 dto.sku,
        title:               dto.title,
        priceCents:          dto.priceCents,
        compareAtPriceCents: dto.compareAtPriceCents ?? null,
        barcode:             dto.barcode ?? null,
        weightGrams:         dto.weightGrams ?? null,
        mediaKeys:           dto.mediaKeys ?? [],
        isDefault:           dto.isDefault ?? false,
        sortOrder:           dto.sortOrder ?? 0,
      });
      const saved = await em.save(ProductVariant, variant);

      await em.save(InventoryItem, em.create(InventoryItem, {
        variantId: saved.id,
        productId,
        available: dto.initialStock ?? 0,
      }));

      return saved;
    });
  }

  async updateVariant(variantId: string, dto: Partial<CreateVariantDto>): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOneBy({ id: variantId });
    if (!variant) throw new NotFoundException('Variant not found');

    if (dto.sku && dto.sku !== variant.sku) {
      const conflict = await this.variantRepo.findOneBy({ sku: dto.sku });
      if (conflict && conflict.id !== variantId) throw new ConflictException('SKU already in use');
    }

    Object.assign(variant, {
      sku:                 dto.sku                ?? variant.sku,
      title:               dto.title              ?? variant.title,
      priceCents:          dto.priceCents         ?? variant.priceCents,
      compareAtPriceCents: dto.compareAtPriceCents !== undefined ? dto.compareAtPriceCents ?? null : variant.compareAtPriceCents,
      barcode:             dto.barcode            !== undefined ? dto.barcode ?? null : variant.barcode,
      weightGrams:         dto.weightGrams        !== undefined ? dto.weightGrams ?? null : variant.weightGrams,
      mediaKeys:           dto.mediaKeys          ?? variant.mediaKeys,
      isDefault:           dto.isDefault          !== undefined ? dto.isDefault : variant.isDefault,
      sortOrder:           dto.sortOrder          !== undefined ? dto.sortOrder : variant.sortOrder,
    });
    return this.variantRepo.save(variant);
  }

  async deleteVariant(variantId: string): Promise<void> {
    const variant = await this.variantRepo.findOneBy({ id: variantId });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.variantRepo.remove(variant);
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
