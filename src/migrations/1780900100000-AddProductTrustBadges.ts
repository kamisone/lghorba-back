import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `trustBadges` jsonb column to shop_products — an ordered list of
 * icon+label trust signals shown near the PDP buy box (e.g. "Secure checkout",
 * "Free shipping"). Each item: { id, icon, label, sortOrder }.
 * FR/EN translations for label are stored in `translations` under
 * entityType 'shop_product', field `trustBadge:{id}:label`.
 */
export class AddProductTrustBadges1780900100000 implements MigrationInterface {
  name = 'AddProductTrustBadges1780900100000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "trustBadges" JSONB NOT NULL DEFAULT '[]'
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "trustBadges"
    `);
  }
}
