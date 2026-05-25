import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3: Normalize variation data.
 *
 * 1. Creates `shop_product_variant_attributes` — the product-level attribute
 *    scoping table (which variation dimensions does this product use?).
 * 2. Seeds `shop_variation_option_values` from distinct (attributeId, value)
 *    pairs already present in `shop_variant_options`.
 * 3. Backfills `shop_variant_options.optionValueId` from the seeded values.
 */
export class VariationPhase31779700000000 implements MigrationInterface {
  name = 'VariationPhase31779700000000';

  async up(runner: QueryRunner): Promise<void> {
    // 1 ── Product-level attribute scoping table ─────────────────────────────
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "shop_product_variant_attributes" (
        "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
        "productId"   UUID NOT NULL,
        "attributeId" UUID NOT NULL,
        "sortOrder"   INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "PK_shop_product_variant_attributes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pva_product"
          FOREIGN KEY ("productId")
          REFERENCES "shop_products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pva_attribute"
          FOREIGN KEY ("attributeId")
          REFERENCES "shop_variant_attributes"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_pva_product_attribute"
          UNIQUE ("productId", "attributeId")
      )
    `);

    // 2 ── Seed VariationOptionValues from existing free-text variant options ─
    await runner.query(`
      INSERT INTO "shop_variation_option_values" ("id", "attributeId", "value", "sortOrder", "isActive")
      SELECT
        gen_random_uuid(),
        "attributeId",
        value,
        0,
        true
      FROM (
        SELECT DISTINCT "attributeId", value
        FROM "shop_variant_options"
        WHERE value IS NOT NULL AND value <> ''
      ) AS distinct_values
      ON CONFLICT ("attributeId", value) DO NOTHING
    `);

    // 3 ── Backfill optionValueId on existing VariantOption rows ────────────
    await runner.query(`
      UPDATE "shop_variant_options" vo
      SET "optionValueId" = ov.id
      FROM "shop_variation_option_values" ov
      WHERE vo."attributeId" = ov."attributeId"
        AND vo.value = ov.value
        AND vo."optionValueId" IS NULL
    `);

    // 4 ── Seed product_variant_attributes from existing variant → options ──
    //      A product uses an attribute if any of its variants have an option
    //      with that attribute. Populate so the scoping table reflects reality.
    await runner.query(`
      INSERT INTO "shop_product_variant_attributes" ("productId", "attributeId", "sortOrder")
      SELECT DISTINCT
        pv."productId",
        vo."attributeId",
        0
      FROM "shop_variant_options" vo
      JOIN "shop_product_variants" pv ON pv.id = vo."variantId"
      ON CONFLICT ("productId", "attributeId") DO NOTHING
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS "shop_product_variant_attributes"`);
    // NOTE: we do NOT revert the optionValueId backfill or the seeded
    // VariationOptionValues — doing so would risk data loss for any new rows
    // written after this migration ran.
  }
}
