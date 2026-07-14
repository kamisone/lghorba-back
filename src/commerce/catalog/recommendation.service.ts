import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { Product } from '../entities/product.entity';

const TTL_SECONDS = 3600; // 1 hour cache

export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  minPriceCents: number | null;
  featuredImageUrl: string | null;
  averageRating: number | null;
  reviewCount: number;
}

@Injectable()
export class RecommendationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly redis: RedisService,
    private readonly assetUrl: AssetUrlService,
  ) {}

  // ── Frequently bought together ────────────────────────────────────────────
  // SQL: find products that most often appear in the same completed orders.

  async getFrequentlyBoughtTogether(
    productId: string,
    limit = 6,
  ): Promise<ProductSummary[]> {
    const cacheKey = `shop:reco:fbt:${productId}:${limit}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as ProductSummary[];

    const rows: Array<{ productId: string; co_count: string }> =
      await this.dataSource.query(
        `SELECT i2."productId", COUNT(*) AS co_count
       FROM shop_order_items i1
       JOIN shop_order_items i2
         ON i1."orderId" = i2."orderId"
        AND i2."productId" != i1."productId"
       JOIN shop_orders o ON o.id = i1."orderId"
       WHERE i1."productId" = $1
         AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
         AND i2."productId" IS NOT NULL
       GROUP BY i2."productId"
       ORDER BY co_count DESC
       LIMIT $2`,
        [productId, limit],
      );

    const ids = rows.map((r) => r.productId);
    if (!ids.length) {
      await this.redis.client.set(cacheKey, '[]', 'EX', TTL_SECONDS);
      return [];
    }

    const result = await this.fetchSummaries(ids);
    await this.redis.client.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      TTL_SECONDS,
    );
    return result;
  }

  // ── Similar products ──────────────────────────────────────────────────────
  // SQL: products sharing the most category/tag overlaps.

  async getSimilarProducts(
    productId: string,
    limit = 6,
  ): Promise<ProductSummary[]> {
    const cacheKey = `shop:reco:similar:${productId}:${limit}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as ProductSummary[];

    const rows: Array<{ id: string; overlap: string }> =
      await this.dataSource.query(
        `SELECT p.id,
              COUNT(DISTINCT cat."categoryId") + COUNT(DISTINCT tag."tagId") AS overlap
       FROM shop_products p
       LEFT JOIN shop_product_category_map cat ON cat."productId" = p.id
       LEFT JOIN shop_product_tag_map tag ON tag."productId" = p.id
       WHERE p.id != $1
         AND p.status = 'active'
         AND p."deletedAt" IS NULL
         AND (
           cat."categoryId" IN (
             SELECT "categoryId" FROM shop_product_category_map WHERE "productId" = $1
           )
           OR tag."tagId" IN (
             SELECT "tagId" FROM shop_product_tag_map WHERE "productId" = $1
           )
         )
       GROUP BY p.id
       ORDER BY overlap DESC
       LIMIT $2`,
        [productId, limit],
      );

    const ids = rows.map((r) => r.id);
    if (!ids.length) {
      await this.redis.client.set(cacheKey, '[]', 'EX', TTL_SECONDS);
      return [];
    }

    const result = await this.fetchSummaries(ids);
    await this.redis.client.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      TTL_SECONDS,
    );
    return result;
  }

  // ── Invalidate cache when product changes ─────────────────────────────────

  async invalidateProduct(productId: string): Promise<void> {
    const keys = await this.redis.client.keys(`shop:reco:*:${productId}:*`);
    if (keys.length) await this.redis.client.del(...keys);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async fetchSummaries(ids: string[]): Promise<ProductSummary[]> {
    if (!ids.length) return [];

    const rows: Array<{
      id: string;
      slug: string;
      title: string;
      featuredImageKey: string | null;
      priceCents: string | null;
      avgRating: string | null;
      reviewCount: string | null;
    }> = await this.dataSource.query(
      `SELECT p.id, p.slug, p.title, p."featuredImageKey",
              COALESCE(v."priceCents", p."basePriceCents") AS "priceCents",
              rev."avgRating", rev."reviewCount"
       FROM shop_products p
       LEFT JOIN shop_product_variants v ON v."productId" = p.id AND v."isDefault" = true
       LEFT JOIN (
         SELECT "productId", AVG(rating) AS "avgRating", COUNT(*) AS "reviewCount"
         FROM shop_product_reviews
         WHERE status = 'approved'
         GROUP BY "productId"
       ) rev ON rev."productId" = p.id
       WHERE p.id = ANY($1::uuid[])
         AND p.status = 'active'
         AND p."deletedAt" IS NULL`,
      [ids],
    );

    const urlMap = await this.assetUrl.resolveBatch(
      rows.map((r) => r.featuredImageKey).filter((k): k is string => k != null),
    );

    const idOrder = new Map(ids.map((id, i) => [id, i]));
    const mapped: ProductSummary[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      featuredImageUrl: r.featuredImageKey
        ? urlMap.get(r.featuredImageKey) ?? null
        : null,
      minPriceCents: r.priceCents != null ? parseInt(r.priceCents, 10) : null,
      averageRating:
        r.avgRating != null
          ? Math.round(parseFloat(r.avgRating) * 10) / 10
          : null,
      reviewCount: r.reviewCount != null ? parseInt(r.reviewCount, 10) : 0,
    }));

    return mapped.sort(
      (a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999),
    );
  }
}
