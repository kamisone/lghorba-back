import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces the three-tier variant pricing model:
 *
 *   1. Product-level base price  (shop_products.basePriceCents)
 *   2. Option-value adjustment   (shop_variation_option_values.priceAdjustmentCents)
 *   3. Variant explicit override (shop_product_variants.priceCents — now nullable)
 *
 * Resolution logic:
 *   effective = variant.priceCents ?? (product.basePriceCents ?? 0) + sum(option adjustments)
 *
 * All existing variants keep their priceCents values (unchanged). Existing products get
 * basePriceCents = NULL, which means their variants continue to use the explicit override
 * price until an admin sets the base price and migrates to computed pricing.
 */
export class AddVariantPricingModel1780901100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Product base price — NULL means "no base price set" (uses variant override)
    await queryRunner.query(`
      ALTER TABLE "shop_products"
      ADD COLUMN IF NOT EXISTS "basePriceCents" int NULL
    `);

    // 2. Per-option-value price adjustment — NULL means "no adjustment" (+0)
    await queryRunner.query(`
      ALTER TABLE "shop_variation_option_values"
      ADD COLUMN IF NOT EXISTS "priceAdjustmentCents" int NULL
    `);

    // 3. Make variant priceCents nullable — NULL means "use computed price"
    await queryRunner.query(`
      ALTER TABLE "shop_product_variants"
      ALTER COLUMN "priceCents" DROP NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Re-apply NOT NULL only after setting 0 as fallback for any null rows
    await queryRunner.query(`
      UPDATE "shop_product_variants" SET "priceCents" = 0 WHERE "priceCents" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "shop_product_variants"
      ALTER COLUMN "priceCents" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "shop_variation_option_values"
      DROP COLUMN IF EXISTS "priceAdjustmentCents"
    `);
    await queryRunner.query(`
      ALTER TABLE "shop_products"
      DROP COLUMN IF EXISTS "basePriceCents"
    `);
  }
}
