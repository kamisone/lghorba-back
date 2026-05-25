import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { z } from 'zod';
import { Product } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { VariantOption } from '../entities/variant-option.entity';
import { VariationOptionValue } from '../entities/variation-option-value.entity';
import { VariantAttribute } from '../entities/variant-attribute.entity';
import { ProductVariantAttribute } from '../entities/product-variant-attribute.entity';
import { InventoryItem } from '../entities/inventory-item.entity';
import { ProductCategory } from '../entities/product-category.entity';
import { ProductTag } from '../entities/product-tag.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { MediaService } from '../../media/media.service';
import { ProductSearchService } from './product-search.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_PRODUCT, ET_SHOP_VARIANT_ATTR, ET_SHOP_VARIATION_OPTION } from '../../common/entity-types';
import { slugify } from '../../common/utils/slug.util';

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
  /** Omit to auto-generate from product + options (e.g. TSHIRT-BLK-M) */
  sku:                z.string().min(1).max(200).optional(),
  /** Omit to auto-generate from selected option values (e.g. "Black / M") */
  title:              z.string().min(1).max(500).optional(),
  priceCents:          z.number().int().min(0),
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

export const UpdateVariantSchema = CreateVariantSchema.omit({ initialStock: true }).extend({
  priceCents: z.number().int().min(0).optional(),
}).partial();

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

    const urlMap = await this.assetUrlService.resolveBatch([...allKeys]);

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
    if (search) qb.andWhere('p.title ILIKE :q', { q: `%${search}%` });

    const [raw, total] = await qb.getManyAndCount();
    const withUrls = await this.resolveProductsUrls(raw) as any[];

    // Batch-compute outOfStock flag: true only when inventory items exist AND all are ≤ 0.
    // Matches PDP logic: a variant with no inventory row is treated as available.
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
    }

    const items = await this.translationsService.maybeApply(withUrls, ET_SHOP_PRODUCT, lang);
    return { items, total };
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
    const resolved: any = await this.resolveProductUrls(product);
    return this.translationsService.maybeApplyOne(resolved, ET_SHOP_PRODUCT, lang);
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

    // Keep the default variant's price in sync when caller provides priceCents
    if (dto.priceCents !== undefined) {
      await this.variantRepo.update({ productId: id, isDefault: true }, { priceCents: dto.priceCents });
    }
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
        priceCents:          dto.priceCents,
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

    // Use a reference price from the first existing variant, or 0 for new products
    const existingVariant = await this.variantRepo.findOne({
      where: { productId },
      order: { createdAt: 'ASC' },
    });
    const refPriceCents = existingVariant?.priceCents ?? 0;

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
          priceCents:  refPriceCents,
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

    return { created, skipped, combinations };
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
        priceCents:          dto.priceCents          ?? variant.priceCents,
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

  async removeProductAttribute(productId: string, attributeId: string): Promise<void> {
    await this.productAttrRepo.delete({ productId, attributeId });
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

    const variant = await this.variantRepo.findOne({
      where: { productId, combinationHash: hash },
      relations: ['options'],
    });
    if (!variant) return { status: 'unavailable', variant: null };

    const inventory   = await this.inventoryRepo.findOneBy({ variantId: variant.id });
    const hasInventory = !!inventory;
    const available   = hasInventory ? (inventory!.available ?? 0) : -1;

    const featuredMediaUrl = variant.featuredMediaKey
      ? ((await this.assetUrlService.resolveBatch([variant.featuredMediaKey])).get(variant.featuredMediaKey) ?? null)
      : null;

    return {
      status:  !hasInventory || available > 0 ? 'available' : 'out_of_stock',
      variant: {
        id:                  variant.id,
        sku:                 variant.sku,
        title:               variant.title,
        priceCents:          variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents ?? null,
        variantSlug:         variant.variantSlug ?? null,
        featuredMediaUrl,
        available,
        optionValueIds:      (variant.options ?? []).map(o => o.optionValueId).filter(Boolean) as string[],
      },
    };
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

    const variants = await this.variantRepo.find({
      where: { productId },
      relations: ['options'],
    });

    const inventoryRows = await this.inventoryRepo.findBy({ productId });
    const hasInventory  = inventoryRows.length > 0;
    const stockMap      = new Map(inventoryRows.map(i => [i.variantId, i.available]));

    const mediaKeys = variants.map(v => v.featuredMediaKey).filter(Boolean) as string[];
    const urlMap = await this.assetUrlService.resolveBatch(mediaKeys);

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
          swatchValue:  ov.swatchValue,
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
        priceCents:          v.priceCents,
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
