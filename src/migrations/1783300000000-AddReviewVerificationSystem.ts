import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verified Purchase Reviews — moderation/audit fields, media, dedupe, and
 * cached product rating aggregates.
 *
 *   shop_product_reviews → media, rejectionReason, moderatedAt, moderatedBy,
 *                           FK to shop_products, status data migration
 *                           ('published' → 'approved'), partial unique index
 *                           on (orderId, productId) for order+product dedupe.
 *   shop_products         → ratingAverage, reviewCount, ratingDistribution
 *                           (cached, backfilled from existing approved reviews).
 */
export class AddReviewVerificationSystem1783300000000
  implements MigrationInterface
{
  public async up(qr: QueryRunner): Promise<void> {
    // ── shop_product_reviews: new columns ─────────────────────────────────────
    await qr.query(
      `ALTER TABLE shop_product_reviews ADD COLUMN IF NOT EXISTS "media" jsonb NOT NULL DEFAULT '[]'`,
    );
    await qr.query(
      `ALTER TABLE shop_product_reviews ADD COLUMN IF NOT EXISTS "rejectionReason" VARCHAR(500)`,
    );
    await qr.query(
      `ALTER TABLE shop_product_reviews ADD COLUMN IF NOT EXISTS "moderatedAt" TIMESTAMPTZ`,
    );
    await qr.query(
      `ALTER TABLE shop_product_reviews ADD COLUMN IF NOT EXISTS "moderatedBy" VARCHAR(300)`,
    );

    // ── Status vocabulary: 'published' → 'approved' (adds 'hidden' at the app level) ──
    await qr.query(
      `UPDATE shop_product_reviews SET status = 'approved' WHERE status = 'published'`,
    );

    // ── FK: productId → shop_products (column already existed, unenforced) ────
    await qr.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_reviews_product'
        ) THEN
          ALTER TABLE shop_product_reviews
            ADD CONSTRAINT "FK_shop_reviews_product"
            FOREIGN KEY ("productId") REFERENCES shop_products(id) ON DELETE CASCADE;
        END IF;
      END $$
    `);

    // ── Dedupe: one review per (order, product) — the atomic upsert key ───────
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_review_order_product"
      ON shop_product_reviews ("orderId", "productId")
      WHERE "orderId" IS NOT NULL
    `);

    // ── shop_products: cached rating aggregates ────────────────────────────────
    await qr.query(
      `ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS "ratingAverage" NUMERIC(3,2) NOT NULL DEFAULT 0`,
    );
    await qr.query(
      `ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS "reviewCount" INT NOT NULL DEFAULT 0`,
    );
    await qr.query(`
      ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS "ratingDistribution" jsonb
      NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'
    `);

    // ── Backfill from existing approved reviews ────────────────────────────────
    await qr.query(`
      UPDATE shop_products p SET
        "ratingAverage" = COALESCE(agg.avg_rating, 0),
        "reviewCount"   = COALESCE(agg.review_count, 0),
        "ratingDistribution" = COALESCE(agg.distribution, '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb)
      FROM (
        SELECT
          "productId",
          ROUND(AVG(rating)::numeric, 2) AS avg_rating,
          COUNT(*) AS review_count,
          jsonb_build_object(
            '1', COUNT(*) FILTER (WHERE rating = 1),
            '2', COUNT(*) FILTER (WHERE rating = 2),
            '3', COUNT(*) FILTER (WHERE rating = 3),
            '4', COUNT(*) FILTER (WHERE rating = 4),
            '5', COUNT(*) FILTER (WHERE rating = 5)
          ) AS distribution
        FROM shop_product_reviews
        WHERE status = 'approved'
        GROUP BY "productId"
      ) agg
      WHERE p.id = agg."productId"
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE shop_products DROP COLUMN IF EXISTS "ratingDistribution"`,
    );
    await qr.query(
      `ALTER TABLE shop_products DROP COLUMN IF EXISTS "reviewCount"`,
    );
    await qr.query(
      `ALTER TABLE shop_products DROP COLUMN IF EXISTS "ratingAverage"`,
    );

    await qr.query(`DROP INDEX IF EXISTS "IDX_review_order_product"`);
    await qr.query(
      `ALTER TABLE shop_product_reviews DROP CONSTRAINT IF EXISTS "FK_shop_reviews_product"`,
    );

    await qr.query(
      `UPDATE shop_product_reviews SET status = 'published' WHERE status = 'approved'`,
    );

    await qr.query(
      `ALTER TABLE shop_product_reviews DROP COLUMN IF EXISTS "moderatedBy"`,
    );
    await qr.query(
      `ALTER TABLE shop_product_reviews DROP COLUMN IF EXISTS "moderatedAt"`,
    );
    await qr.query(
      `ALTER TABLE shop_product_reviews DROP COLUMN IF EXISTS "rejectionReason"`,
    );
    await qr.query(
      `ALTER TABLE shop_product_reviews DROP COLUMN IF EXISTS "media"`,
    );
  }
}
