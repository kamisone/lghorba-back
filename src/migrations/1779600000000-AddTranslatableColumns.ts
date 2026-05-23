import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTranslatableColumns1779600000000 implements MigrationInterface {
  name = 'AddTranslatableColumns1779600000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "shop_products" ADD COLUMN IF NOT EXISTS "featuredImageAlt" VARCHAR(500) NULL`);
    await runner.query(`ALTER TABLE "shop_shipping_methods" ADD COLUMN IF NOT EXISTS "description" TEXT NULL`);
    await runner.query(`ALTER TABLE "shop_collections" ADD COLUMN IF NOT EXISTS "heroTitle" VARCHAR(255) NULL`);
    await runner.query(`ALTER TABLE "shop_collections" ADD COLUMN IF NOT EXISTS "heroSubtitle" TEXT NULL`);
    await runner.query(`ALTER TABLE "shop_promotions" ADD COLUMN IF NOT EXISTS "marketingLabel" VARCHAR(255) NULL`);
    await runner.query(`ALTER TABLE "shop_promotions" ADD COLUMN IF NOT EXISTS "bannerText" TEXT NULL`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "shop_promotions" DROP COLUMN IF EXISTS "bannerText"`);
    await runner.query(`ALTER TABLE "shop_promotions" DROP COLUMN IF EXISTS "marketingLabel"`);
    await runner.query(`ALTER TABLE "shop_collections" DROP COLUMN IF EXISTS "heroSubtitle"`);
    await runner.query(`ALTER TABLE "shop_collections" DROP COLUMN IF EXISTS "heroTitle"`);
    await runner.query(`ALTER TABLE "shop_shipping_methods" DROP COLUMN IF EXISTS "description"`);
    await runner.query(`ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "featuredImageAlt"`);
  }
}
