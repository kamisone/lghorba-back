import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A free-shipping product may offer several paid faster options, not just one.
 *
 * Replaces the single `shop_products.freeShippingUpgradeMethodId` column with a
 * join table. Which of the configured methods a given customer actually sees is
 * decided at checkout by their shipping zone — a method belonging to another
 * zone simply is not in the quote.
 *
 * Existing single selections are carried over before the column is dropped.
 */
export class ProductFreeShippingMethodsMany1785500000000 implements MigrationInterface {
  name = 'ProductFreeShippingMethodsMany1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_product_free_shipping_methods" (
        "productId"        uuid NOT NULL,
        "shippingMethodId" uuid NOT NULL,
        CONSTRAINT "PK_shop_product_free_shipping_methods"
          PRIMARY KEY ("productId", "shippingMethodId"),
        CONSTRAINT "FK_pfsm_product"
          FOREIGN KEY ("productId") REFERENCES "shop_products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pfsm_method"
          FOREIGN KEY ("shippingMethodId") REFERENCES "shop_shipping_methods"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pfsm_productId"
      ON "shop_product_free_shipping_methods" ("productId")
    `);

    // Carry over whatever single upgrade each product already had.
    const hasOldColumn: Array<{ exists: boolean }> = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shop_products' AND column_name = 'freeShippingUpgradeMethodId'
      ) AS exists
    `);
    if (hasOldColumn[0]?.exists) {
      await queryRunner.query(`
        INSERT INTO "shop_product_free_shipping_methods" ("productId", "shippingMethodId")
        SELECT p."id", p."freeShippingUpgradeMethodId"
        FROM "shop_products" p
        WHERE p."freeShippingUpgradeMethodId" IS NOT NULL
        ON CONFLICT DO NOTHING
      `);
      await queryRunner.query(`
        ALTER TABLE "shop_products"
          DROP CONSTRAINT IF EXISTS "FK_shop_products_freeShippingUpgradeMethod"
      `);
      await queryRunner.query(`
        ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "freeShippingUpgradeMethodId"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "freeShippingUpgradeMethodId" uuid
    `);
    // Only one can survive the narrowing; keep the lowest id for determinism.
    await queryRunner.query(`
      UPDATE "shop_products" p
      SET "freeShippingUpgradeMethodId" = sub."shippingMethodId"
      FROM (
        SELECT "productId", MIN("shippingMethodId"::text)::uuid AS "shippingMethodId"
        FROM "shop_product_free_shipping_methods"
        GROUP BY "productId"
      ) sub
      WHERE sub."productId" = p."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        ADD CONSTRAINT "FK_shop_products_freeShippingUpgradeMethod"
        FOREIGN KEY ("freeShippingUpgradeMethodId")
        REFERENCES "shop_shipping_methods"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_product_free_shipping_methods"`);
  }
}
