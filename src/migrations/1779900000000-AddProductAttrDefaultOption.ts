import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductAttrDefaultOption1779900000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE shop_product_variant_attributes
      ADD COLUMN IF NOT EXISTS "defaultOptionValueId" uuid
        REFERENCES shop_variation_option_values(id) ON DELETE SET NULL;
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE shop_product_variant_attributes
      DROP COLUMN IF EXISTS "defaultOptionValueId";
    `);
  }
}
