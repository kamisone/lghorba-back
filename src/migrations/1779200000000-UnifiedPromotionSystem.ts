import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unifies the promotion system:
 *  - Renames shop_promotion_category_rules → shop_promotion_categories (cleaner name)
 *  - Adds trigger / scope / priority columns to shop_promotions
 *  - Backfills trigger from code presence, scope from existing category rules
 *  - Creates shop_promotion_products (product-scoped promotions)
 */
export class UnifiedPromotionSystem1779200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Rename category junction table ─────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE IF EXISTS shop_promotion_category_rules
      RENAME TO shop_promotion_categories
    `);

    // ── 2. Add new columns to shop_promotions ─────────────────────────────
    await queryRunner.query(`
      ALTER TABLE shop_promotions
        ADD COLUMN IF NOT EXISTS "trigger"  varchar(20) NOT NULL DEFAULT 'automatic',
        ADD COLUMN IF NOT EXISTS "scope"    varchar(20) NOT NULL DEFAULT 'site_wide',
        ADD COLUMN IF NOT EXISTS "priority" int         NOT NULL DEFAULT 0
    `);

    // ── 3. Backfill trigger ────────────────────────────────────────────────
    await queryRunner.query(`
      UPDATE shop_promotions
      SET "trigger" = 'coupon'
      WHERE code IS NOT NULL
    `);

    // ── 4. Backfill scope from category links ─────────────────────────────
    await queryRunner.query(`
      UPDATE shop_promotions
      SET "scope" = 'category'
      WHERE id IN (
        SELECT DISTINCT "promotionId" FROM shop_promotion_categories
      )
    `);

    // ── 5. Create product-scope junction table ─────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shop_promotion_products (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        "promotionId" uuid        NOT NULL REFERENCES shop_promotions(id) ON DELETE CASCADE,
        "productId"   uuid        NOT NULL REFERENCES shop_products(id)   ON DELETE CASCADE,
        CONSTRAINT uq_promo_product UNIQUE ("promotionId", "productId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_products_promotion ON shop_promotion_products ("promotionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_promo_products_product ON shop_promotion_products ("productId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS shop_promotion_products`);

    await queryRunner.query(`
      ALTER TABLE shop_promotions
        DROP COLUMN IF EXISTS "priority",
        DROP COLUMN IF EXISTS "scope",
        DROP COLUMN IF EXISTS "trigger"
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS shop_promotion_categories
      RENAME TO shop_promotion_category_rules
    `);
  }
}
