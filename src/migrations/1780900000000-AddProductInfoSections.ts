import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `infoSections` jsonb column to shop_products — an ordered list of
 * structured spec blocks (Composition, Lavage, Sexe, Dimensions, ...) shown
 * on the product page. Each item: { id, key, label, value, sortOrder }.
 * FR/EN translations for label/value are stored in `translations` under
 * entityType 'shop_product', field `infoSection:{id}:label|value`.
 */
export class AddProductInfoSections1780900000000 implements MigrationInterface {
  name = 'AddProductInfoSections1780900000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "infoSections" JSONB NOT NULL DEFAULT '[]'
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "infoSections"
    `);
  }
}
