import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quantity-based upselling ("buy N, pay X each") for shop products.
 *
 * upsellingEnabled defaults to false and upsellTiers defaults to an empty
 * array, so every existing product is completely unaffected until an admin
 * opts a product in — matches the pattern of every other jsonb array column
 * on shop_products (documents, faqs, trustBadges, ...).
 */
export class AddProductUpsellTiers1786472200000 implements MigrationInterface {
  name = 'AddProductUpsellTiers1786472200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "upsellingEnabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "upsellTiers" jsonb NOT NULL DEFAULT '[]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        DROP COLUMN IF EXISTS "upsellTiers",
        DROP COLUMN IF EXISTS "upsellingEnabled"
    `);
  }
}
