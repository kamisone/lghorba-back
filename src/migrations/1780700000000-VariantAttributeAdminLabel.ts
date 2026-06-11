import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow multiple VariantAttribute rows to share the same `name` (e.g. two
 * "Couleur" attributes for different product lines, each with its own
 * option-value set), disambiguated in the admin via a new `adminLabel`
 * field. `slug` remains unique.
 */
export class VariantAttributeAdminLabel1780700000000 implements MigrationInterface {
  name = 'VariantAttributeAdminLabel1780700000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "shop_variant_attributes" DROP CONSTRAINT IF EXISTS "shop_variant_attributes_name_key"`);
    await runner.query(`ALTER TABLE "shop_variant_attributes" ADD COLUMN IF NOT EXISTS "adminLabel" VARCHAR(200)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "shop_variant_attributes" DROP COLUMN IF EXISTS "adminLabel"`);
    await runner.query(`ALTER TABLE "shop_variant_attributes" ADD CONSTRAINT "shop_variant_attributes_name_key" UNIQUE ("name")`);
  }
}
