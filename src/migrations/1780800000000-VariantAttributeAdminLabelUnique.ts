import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Swap which field disambiguates VariantAttribute rows: `slug` no longer
 * needs to be unique (it's purely internal/cosmetic and auto-generated from
 * `name`, so duplicate `name`s previously caused a slug collision -> 500),
 * while `adminLabel` becomes the unique disambiguator.
 */
export class VariantAttributeAdminLabelUnique1780800000000 implements MigrationInterface {
  name = 'VariantAttributeAdminLabelUnique1780800000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "shop_variant_attributes" DROP CONSTRAINT IF EXISTS "shop_variant_attributes_slug_key"`);
    await runner.query(`ALTER TABLE "shop_variant_attributes" ADD CONSTRAINT "UQ_shop_va_admin_label" UNIQUE ("adminLabel")`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "shop_variant_attributes" DROP CONSTRAINT IF EXISTS "UQ_shop_va_admin_label"`);
    await runner.query(`ALTER TABLE "shop_variant_attributes" ADD CONSTRAINT "shop_variant_attributes_slug_key" UNIQUE ("slug")`);
  }
}
