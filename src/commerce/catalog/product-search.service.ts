import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeilisearchService } from '../../meilisearch/meilisearch.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { Product } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';

const INDEX = 'shop_products';

export interface SearchFilters {
  category?:  string;
  tag?:       string;
  brand?:     string;
  minPrice?:  number;  // cents
  maxPrice?:  number;  // cents
  status?:    string;
}

export interface SearchResult {
  hits:       any[];
  total:      number;
  facets:     Record<string, Record<string, number>>;
  query:      string;
  processingTimeMs: number;
}

@Injectable()
export class ProductSearchService implements OnModuleInit {
  private readonly logger = new Logger(ProductSearchService.name);

  constructor(
    private readonly meili:     MeilisearchService,
    private readonly assetUrl:  AssetUrlService,
    @InjectRepository(Product)        private readonly productRepo:  Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantRepo:  Repository<ProductVariant>,
  ) {}

  get isEnabled(): boolean { return this.meili.isEnabled; }

  async onModuleInit(): Promise<void> {
    if (!this.meili.isEnabled) return;
    try {
      await this.meili.configureIndex(INDEX, 'id', {
        searchableAttributes: ['title', 'shortDescription', 'brand', 'sku', 'categoryNames', 'tagNames'],
        filterableAttributes: ['status', 'brand', 'categoryIds', 'tagIds', 'minPriceCents'],
        sortableAttributes:   ['minPriceCents', 'createdAt', 'title'],
        faceting: {
          maxValuesPerFacet: 50,
        },
        pagination: { maxTotalHits: 1000 },
      });
      this.logger.log('Meilisearch product index configured');
    } catch (err) {
      this.logger.error('Failed to configure Meilisearch index', (err as Error).message);
    }
  }

  // ── Index a single product ────────────────────────────────────────────────

  async indexProduct(product: Product): Promise<void> {
    if (!this.meili.isEnabled) return;

    const variants = await this.variantRepo.findBy({ productId: product.id });
    const prices   = variants
      .map(v => v.priceCents ?? product.basePriceCents)
      .filter((p): p is number => p !== null && p !== undefined);

    const doc = {
      id:               product.id,
      slug:             product.slug,
      title:            product.title,
      shortDescription: product.shortDescription ?? '',
      brand:            product.brand ?? '',
      sku:              product.sku ?? '',
      status:           product.status,
      featured:         product.featured,
      minPriceCents:    prices.length ? Math.min(...prices) : 0,
      maxPriceCents:    prices.length ? Math.max(...prices) : 0,
      categoryIds:      (product.categories ?? []).map((c: any) => c.id),
      categoryNames:    (product.categories ?? []).map((c: any) => c.name).join(' '),
      tagIds:           (product.tags ?? []).map((t: any) => t.id),
      tagNames:         (product.tags ?? []).map((t: any) => t.name).join(' '),
      featuredImageKey: product.featuredImageKey ?? null,
      createdAt:        product.createdAt?.toISOString() ?? new Date().toISOString(),
    };

    await this.meili.index(INDEX).addDocuments([doc]);
  }

  async removeFromIndex(productId: string): Promise<void> {
    if (!this.meili.isEnabled) return;
    await this.meili.index(INDEX).deleteDocument(productId);
  }

  // ── Bulk index all active products (initial sync / re-index) ─────────────

  async reindexAll(): Promise<{ indexed: number }> {
    if (!this.meili.isEnabled) return { indexed: 0 };

    const products = await this.productRepo.find({
      where:     { status: 'active' },
      relations: ['categories', 'tags'],
    });

    const variantsByProduct = new Map<string, ProductVariant[]>();
    const pIds = products.map(p => `'${p.id}'`).join(',');
    if (pIds) {
      const variants = await this.variantRepo
        .createQueryBuilder('v')
        .where(`v.productId IN (${pIds})`)
        .getMany();
      variants.forEach(v => {
        const arr = variantsByProduct.get(v.productId) ?? [];
        arr.push(v);
        variantsByProduct.set(v.productId, arr);
      });
    }

    const docs = products.map(p => {
      const variants = variantsByProduct.get(p.id) ?? [];
      const prices   = variants
        .map(v => v.priceCents ?? p.basePriceCents)
        .filter((x): x is number => x !== null && x !== undefined);
      return {
        id:               p.id,
        slug:             p.slug,
        title:            p.title,
        shortDescription: p.shortDescription ?? '',
        brand:            p.brand ?? '',
        sku:              p.sku ?? '',
        status:           p.status,
        featured:         p.featured,
        minPriceCents:    prices.length ? Math.min(...prices) : 0,
        maxPriceCents:    prices.length ? Math.max(...prices) : 0,
        categoryIds:      (p.categories ?? []).map((c: any) => c.id),
        categoryNames:    (p.categories ?? []).map((c: any) => c.name).join(' '),
        tagIds:           (p.tags ?? []).map((t: any) => t.id),
        tagNames:         (p.tags ?? []).map((t: any) => t.name).join(' '),
        featuredImageKey: p.featuredImageKey ?? null,
        createdAt:        p.createdAt?.toISOString() ?? new Date().toISOString(),
      };
    });

    if (docs.length) {
      await this.meili.index(INDEX).addDocuments(docs);
    }

    return { indexed: docs.length };
  }

  // ── Faceted search ────────────────────────────────────────────────────────

  async search(
    query: string,
    filters: SearchFilters = {},
    page = 1,
    hitsPerPage = 24,
  ): Promise<SearchResult> {
    const result = this.meili.isEnabled
      ? await this.searchMeili(query, filters, page, hitsPerPage)
      : await this.searchDb(query, filters, page, hitsPerPage);

    // Resolve featuredImageKey → featuredImageUrl for all hits
    const keys = result.hits
      .map((h: any) => h.featuredImageKey)
      .filter((k: any): k is string => !!k);
    const urlMap = await this.assetUrl.resolveBatch(keys);
    result.hits = result.hits.map((h: any) => ({
      ...h,
      featuredImageUrl: h.featuredImageKey ? (urlMap.get(h.featuredImageKey) ?? null) : null,
    }));

    return result;
  }

  private async searchMeili(
    query: string,
    filters: SearchFilters,
    page: number,
    hitsPerPage: number,
  ): Promise<SearchResult> {
    const filterParts: string[] = ['status = "active"'];
    if (filters.category) filterParts.push(`categoryIds = "${filters.category}"`);
    if (filters.tag)      filterParts.push(`tagIds = "${filters.tag}"`);
    if (filters.brand)    filterParts.push(`brand = "${filters.brand}"`);
    if (filters.minPrice) filterParts.push(`minPriceCents >= ${filters.minPrice}`);
    if (filters.maxPrice) filterParts.push(`minPriceCents <= ${filters.maxPrice}`);

    const result = await this.meili.index(INDEX).search(query, {
      filter:   filterParts.join(' AND '),
      facets:   ['brand', 'categoryIds', 'tagIds'],
      hitsPerPage,
      page,
    });

    return {
      hits:             result.hits,
      total:            result.totalHits ?? result.estimatedTotalHits ?? 0,
      facets:           result.facetDistribution ?? {},
      query,
      processingTimeMs: result.processingTimeMs,
    };
  }

  // PostgreSQL full-text fallback — mirrors the Meilisearch response shape.
  private async searchDb(
    query: string,
    filters: SearchFilters,
    page: number,
    hitsPerPage: number,
  ): Promise<SearchResult> {
    const t0 = Date.now();
    const q  = query.trim();

    // ── Build a reusable WHERE/JOIN fragment via a raw SQL helper ─────────────
    // Parameters are positional to avoid ORM name conflicts.
    const params: unknown[] = ['active'];
    const conditions: string[] = [`p.status = $${params.length}`, `p."deletedAt" IS NULL`];

    // Track the parameter index for the full-text query so we can reuse it in
    // the rank expression inside the subquery (avoids SQL injection and
    // avoids referencing `p` from an outer scope where it isn't visible).
    let tsIdx = 0;

    const wordIdxs: number[] = [];

    if (q) {
      params.push(`%${q}%`);
      const likeIdx = params.length;
      params.push(q);
      tsIdx = params.length;

      const words = q.split(/\s+/).filter(w => w.length >= 2);
      let wordClause = '';
      if (words.length > 1) {
        const wordParts = words.map(w => {
          params.push(`%${w}%`);
          const wi = params.length;
          wordIdxs.push(wi);
          return `(p.title ILIKE $${wi} OR p."shortDescription" ILIKE $${wi} OR p.brand ILIKE $${wi} OR p.sku ILIKE $${wi})`;
        });
        wordClause = `OR ${wordParts.join(' OR ')}`;
      }

      conditions.push(
        `(p.title ILIKE $${likeIdx}
          OR p."shortDescription" ILIKE $${likeIdx}
          OR p.brand ILIKE $${likeIdx}
          OR p.sku   ILIKE $${likeIdx}
          OR to_tsvector('simple', coalesce(p.title,'') || ' ' || coalesce(p."shortDescription",'') || ' ' || coalesce(p.brand,'') || ' ' || coalesce(p.sku,''))
             @@ plainto_tsquery('simple', $${tsIdx})
          ${wordClause})`,
      );
    }

    if (filters.brand) {
      params.push(filters.brand);
      conditions.push(`p.brand = $${params.length}`);
    }
    if (filters.category) {
      params.push(filters.category);
      conditions.push(`EXISTS (
        SELECT 1 FROM shop_product_category_map pcm
        WHERE pcm."productId" = p.id AND pcm."categoryId" = $${params.length}
      )`);
    }
    if (filters.tag) {
      params.push(filters.tag);
      conditions.push(`EXISTS (
        SELECT 1 FROM shop_product_tag_map ptm
        WHERE ptm."productId" = p.id AND ptm."tagId" = $${params.length}
      )`);
    }

    const where = conditions.join(' AND ');

    // ── Price filter applied in outer WHERE against the subquery ──────────────
    let priceHaving = '';
    if (filters.minPrice) { params.push(filters.minPrice); priceHaving += ` AND min_price >= $${params.length}`; }
    if (filters.maxPrice) { params.push(filters.maxPrice); priceHaving += ` AND min_price <= $${params.length}`; }

    // Rank: full-phrase match gets 1000 points, each individual word match adds 1.
    // ts_rank is added as a tiebreaker within the same tier.
    let rankSelect: string;
    if (!tsIdx) {
      rankSelect = ', 0 AS rank_score';
    } else {
      const phraseBoost = `CASE WHEN p.title ILIKE $${tsIdx - 1} OR p.brand ILIKE $${tsIdx - 1} THEN 1000 ELSE 0 END`;
      const wordBoost = wordIdxs.length > 0
        ? ' + ' + wordIdxs.map(wi => `CASE WHEN p.title ILIKE $${wi} OR p.brand ILIKE $${wi} OR p."shortDescription" ILIKE $${wi} THEN 1 ELSE 0 END`).join(' + ')
        : '';
      const tsRank = `ts_rank(to_tsvector('simple', coalesce(p.title,'') || ' ' || coalesce(p."shortDescription",'')), plainto_tsquery('simple', $${tsIdx}))`;
      rankSelect = `, (${phraseBoost}${wordBoost}) + ${tsRank} AS rank_score`;
    }

    // ── Main hits query ───────────────────────────────────────────────────────
    params.push(hitsPerPage);
    const limitIdx = params.length;
    params.push((page - 1) * hitsPerPage);
    const offsetIdx = params.length;

    const hitsQuery = `
      SELECT sub.*
      FROM (
        SELECT
          p.id, p.slug, p.title, p."shortDescription", p.brand, p.sku,
          p."featuredImageKey",
          p.featured, p."createdAt",
          MIN(v."priceCents") AS min_price
          ${rankSelect}
        FROM shop_products p
        LEFT JOIN shop_product_variants v ON v."productId" = p.id
        WHERE ${where}
        GROUP BY p.id
      ) sub
      WHERE 1=1 ${priceHaving}
      ORDER BY sub.featured DESC, sub.rank_score DESC, sub."createdAt" DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    // ── Count query (same filters, no pagination) ─────────────────────────────
    const countParams = [...params.slice(0, params.length - 2)]; // drop LIMIT/OFFSET
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT p.id, MIN(v."priceCents") AS min_price
        FROM shop_products p
        LEFT JOIN shop_product_variants v ON v."productId" = p.id
        WHERE ${where}
        GROUP BY p.id
      ) sub
      WHERE 1=1 ${priceHaving}
    `;

    // ── Brand facets — rebuild params without brand filter so all brands stay visible
    const facetParams: unknown[] = ['active'];
    const facetConditions: string[] = [`p.status = $${facetParams.length}`, `p."deletedAt" IS NULL`];

    if (q) {
      facetParams.push(`%${q}%`);
      const lIdx = facetParams.length;
      facetParams.push(q);
      const tIdx = facetParams.length;

      const fWords = q.split(/\s+/).filter(w => w.length >= 2);
      let fWordClause = '';
      if (fWords.length > 1) {
        const fWordParts = fWords.map(w => {
          facetParams.push(`%${w}%`);
          const wi = facetParams.length;
          return `(p.title ILIKE $${wi} OR p."shortDescription" ILIKE $${wi} OR p.brand ILIKE $${wi} OR p.sku ILIKE $${wi})`;
        });
        fWordClause = `OR ${fWordParts.join(' OR ')}`;
      }

      facetConditions.push(
        `(p.title ILIKE $${lIdx} OR p."shortDescription" ILIKE $${lIdx} OR p.brand ILIKE $${lIdx} OR p.sku ILIKE $${lIdx}
          OR to_tsvector('simple', coalesce(p.title,'') || ' ' || coalesce(p."shortDescription",'') || ' ' || coalesce(p.brand,'') || ' ' || coalesce(p.sku,''))
             @@ plainto_tsquery('simple', $${tIdx})
          ${fWordClause})`,
      );
    }
    if (filters.category) {
      facetParams.push(filters.category);
      facetConditions.push(`EXISTS (
        SELECT 1 FROM shop_product_category_map pcm
        WHERE pcm."productId" = p.id AND pcm."categoryId" = $${facetParams.length}
      )`);
    }
    if (filters.tag) {
      facetParams.push(filters.tag);
      facetConditions.push(`EXISTS (SELECT 1 FROM shop_product_tag_map ptm WHERE ptm."productId" = p.id AND ptm."tagId" = $${facetParams.length})`);
    }

    const brandFacetQuery = `
      SELECT p.brand, COUNT(*) AS cnt
      FROM shop_products p
      WHERE p.brand IS NOT NULL AND p.brand != ''
        AND ${facetConditions.join(' AND ')}
      GROUP BY p.brand
      ORDER BY cnt DESC
      LIMIT 30
    `;

    const [rows, [{ total }], brandRows] = await Promise.all([
      this.productRepo.manager.query(hitsQuery, params) as Promise<any[]>,
      this.productRepo.manager.query(countQuery, countParams) as Promise<[{ total: string }]>,
      this.productRepo.manager.query(brandFacetQuery, facetParams) as Promise<Array<{ brand: string; cnt: string }>>,
    ]);

    const hits = rows.map(r => ({
      id:               r.id,
      slug:             r.slug,
      title:            r.title,
      shortDescription: r.shortDescription ?? '',
      brand:            r.brand ?? '',
      sku:              r.sku ?? '',
      featuredImageKey: r.featuredImageKey ?? null,
      minPriceCents:    r.min_price ? parseInt(r.min_price, 10) : 0,
    }));

    const brandFacets: Record<string, number> = {};
    for (const row of brandRows) brandFacets[row.brand] = parseInt(row.cnt, 10);

    return {
      hits,
      total:            parseInt(String(total), 10),
      facets:           { brand: brandFacets },
      query,
      processingTimeMs: Date.now() - t0,
    };
  }

  // ── Autocomplete ──────────────────────────────────────────────────────────

  async autocomplete(query: string, limit = 8): Promise<Array<{ id: string; slug: string; title: string }>> {
    if (!query.trim()) return [];

    if (this.meili.isEnabled) {
      const result = await this.meili.index(INDEX).search(query, {
        filter:               'status = "active"',
        attributesToRetrieve: ['id', 'slug', 'title'],
        hitsPerPage:          limit,
        page:                 1,
      });
      return result.hits.map((h: any) => ({ id: h.id, slug: h.slug, title: h.title }));
    }

    // DB fallback for autocomplete
    const q = query.trim();
    const like = `%${q}%`;
    const words = q.split(/\s+/).filter(w => w.length >= 2);

    if (words.length <= 1) {
      const rows: Array<{ id: string; slug: string; title: string }> =
        await this.productRepo.manager.query(
          `SELECT p.id, p.slug, p.title
           FROM shop_products p
           WHERE p.status = 'active'
             AND p."deletedAt" IS NULL
             AND (p.title ILIKE $1 OR p.brand ILIKE $1 OR p.sku ILIKE $1)
           ORDER BY p.featured DESC, p."createdAt" DESC
           LIMIT $2`,
          [like, limit],
        );
      return rows;
    }

    const params: unknown[] = [like];
    const wordParts = words.map(w => {
      params.push(`%${w}%`);
      const i = params.length;
      return `(p.title ILIKE $${i} OR p.brand ILIKE $${i} OR p."shortDescription" ILIKE $${i})`;
    });
    params.push(limit);
    const rows: Array<{ id: string; slug: string; title: string }> =
      await this.productRepo.manager.query(
        `SELECT p.id, p.slug, p.title
         FROM shop_products p
         WHERE p.status = 'active'
           AND p."deletedAt" IS NULL
           AND (p.title ILIKE $1 OR p.brand ILIKE $1 OR p.sku ILIKE $1 OR ${wordParts.join(' OR ')})
         ORDER BY p.featured DESC, p."createdAt" DESC
         LIMIT $${params.length}`,
        params,
      );
    return rows;
  }
}
