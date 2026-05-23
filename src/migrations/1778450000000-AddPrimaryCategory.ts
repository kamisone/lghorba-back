import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrimaryCategory1778450000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE shop_products
        ADD COLUMN IF NOT EXISTS "primaryCategoryId" UUID
        REFERENCES shop_product_categories(id) ON DELETE SET NULL
    `);

    await qr.query(`
      UPDATE shop_products p
      SET "primaryCategoryId" = (
        SELECT "categoryId"
        FROM shop_product_category_map m
        WHERE m."productId" = p.id
        LIMIT 1
      )
      WHERE "primaryCategoryId" IS NULL
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_products_primaryCategoryId"
        ON shop_products ("primaryCategoryId")
    `);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_products_createdAt"
        ON shop_products ("createdAt" DESC)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "IDX_shop_products_createdAt"`);
    await qr.query(`DROP INDEX IF EXISTS "IDX_shop_products_primaryCategoryId"`);
    await qr.query(`ALTER TABLE shop_products DROP COLUMN IF EXISTS "primaryCategoryId"`);
  }
}
