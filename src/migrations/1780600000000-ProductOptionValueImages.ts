import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-product images for global "image" swatch option values
 * (e.g. Color → Red). The image representing "Red" differs per product
 * (Product A's red t-shirt vs Product B's red backpack), so it's scoped
 * to (productId, optionValueId) here rather than stored on the global
 * VariationOptionValue.
 */
export class ProductOptionValueImages1780600000000 implements MigrationInterface {
  name = 'ProductOptionValueImages1780600000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "shop_product_option_value_images" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "productId"     UUID NOT NULL,
        "optionValueId" UUID NOT NULL,
        "mediaKey"      VARCHAR(1000) NOT NULL,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_shop_product_option_value_images" PRIMARY KEY ("id"),
        CONSTRAINT "FK_povi_product"
          FOREIGN KEY ("productId")
          REFERENCES "shop_products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_povi_option_value"
          FOREIGN KEY ("optionValueId")
          REFERENCES "shop_variation_option_values"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_povi_product_option_value"
          UNIQUE ("productId", "optionValueId")
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS "shop_product_option_value_images"`);
  }
}
