import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the optional categoryId column to shop_variant_attributes.
 *
 * When set, the attribute only appears in the PDP variant selector for
 * products belonging to that product category (e.g. "Size" only on clothing).
 */
export class VariantAttributeCategory1778700000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE shop_variant_attributes ADD COLUMN IF NOT EXISTS "categoryId" UUID`);
    await qr.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_va_category'
        ) THEN
          ALTER TABLE shop_variant_attributes
            ADD CONSTRAINT "FK_shop_va_category"
            FOREIGN KEY ("categoryId") REFERENCES shop_product_categories(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_va_categoryId" ON shop_variant_attributes ("categoryId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE shop_variant_attributes DROP COLUMN IF EXISTS "categoryId"`);
  }
}
