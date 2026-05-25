import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Production-grade variant hardening:
 *
 * 1. shop_product_variants:
 *    - combinationHash VARCHAR(300) NULL — sorted optionValueIds joined with "|"
 *    - featuredMediaKey VARCHAR(1000) NULL — variant-specific hero image
 *    - variantSlug VARCHAR(300) NULL — URL-safe segment (e.g. "black-m")
 *    Unique partial indexes enforce no duplicate combos or slugs per product.
 *
 * 2. shop_cart_items / shop_order_items:
 *    - optionsSnapshot JSONB NULL — frozen option snapshot at add-to-cart / order time
 *
 * 3. shop_order_items:
 *    - compareAtPriceCentsSnapshot INT NULL — frozen "was" price for order receipts
 */
export class VariantProductionGrade1779800000000 implements MigrationInterface {
  name = 'VariantProductionGrade1779800000000';

  async up(runner: QueryRunner): Promise<void> {
    // ── ProductVariant columns ───────────────────────────────────────────────
    await runner.query(`
      ALTER TABLE "shop_product_variants"
        ADD COLUMN IF NOT EXISTS "combinationHash"  VARCHAR(300)  NULL,
        ADD COLUMN IF NOT EXISTS "featuredMediaKey" VARCHAR(1000) NULL,
        ADD COLUMN IF NOT EXISTS "variantSlug"      VARCHAR(300)  NULL
    `);

    // Unique combination per product (partial: NULL allowed for no-option variants)
    await runner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_variant_combination"
        ON "shop_product_variants" ("productId", "combinationHash")
        WHERE "combinationHash" IS NOT NULL
    `);

    // Unique slug per product (partial: NULL allowed until slugs are generated)
    await runner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_variant_slug"
        ON "shop_product_variants" ("productId", "variantSlug")
        WHERE "variantSlug" IS NOT NULL
    `);

    // ── CartItem snapshot columns ────────────────────────────────────────────
    await runner.query(`
      ALTER TABLE "shop_cart_items"
        ADD COLUMN IF NOT EXISTS "optionsSnapshot"              JSONB NULL,
        ADD COLUMN IF NOT EXISTS "compareAtPriceCentsSnapshot"  INTEGER NULL
    `);

    // ── OrderItem snapshot columns ───────────────────────────────────────────
    await runner.query(`
      ALTER TABLE "shop_order_items"
        ADD COLUMN IF NOT EXISTS "optionsSnapshot"              JSONB NULL,
        ADD COLUMN IF NOT EXISTS "compareAtPriceCentsSnapshot"  INTEGER NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS "UQ_variant_slug"`);
    await runner.query(`DROP INDEX IF EXISTS "UQ_variant_combination"`);
    await runner.query(`
      ALTER TABLE "shop_product_variants"
        DROP COLUMN IF EXISTS "variantSlug",
        DROP COLUMN IF EXISTS "featuredMediaKey",
        DROP COLUMN IF EXISTS "combinationHash"
    `);
    await runner.query(`
      ALTER TABLE "shop_cart_items"
        DROP COLUMN IF EXISTS "compareAtPriceCentsSnapshot",
        DROP COLUMN IF EXISTS "optionsSnapshot"
    `);
    await runner.query(`
      ALTER TABLE "shop_order_items"
        DROP COLUMN IF EXISTS "compareAtPriceCentsSnapshot",
        DROP COLUMN IF EXISTS "optionsSnapshot"
    `);
  }
}
