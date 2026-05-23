import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromotionSystemRefactor1779100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove campaign-group FK from shop_promotions
    await queryRunner.query(`
      ALTER TABLE shop_promotions
      DROP COLUMN IF EXISTS "promotionCategoryId"
    `);

    // Drop the campaign-group table
    await queryRunner.query(`DROP TABLE IF EXISTS shop_promotion_categories`);

    // Add category discount column to orders
    await queryRunner.query(`
      ALTER TABLE shop_orders
      ADD COLUMN IF NOT EXISTS "categoryDiscountCents" int NOT NULL DEFAULT 0
    `);

    // Add pricing snapshot column to orders
    await queryRunner.query(`
      ALTER TABLE shop_orders
      ADD COLUMN IF NOT EXISTS "pricingSnapshot" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE shop_orders DROP COLUMN IF EXISTS "pricingSnapshot"`);
    await queryRunner.query(`ALTER TABLE shop_orders DROP COLUMN IF EXISTS "categoryDiscountCents"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shop_promotion_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(200) NOT NULL,
        slug varchar(200) NOT NULL UNIQUE,
        description text,
        color varchar(7),
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" int NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE shop_promotions
      ADD COLUMN IF NOT EXISTS "promotionCategoryId" uuid
        REFERENCES shop_promotion_categories(id) ON DELETE SET NULL
    `);
  }
}
