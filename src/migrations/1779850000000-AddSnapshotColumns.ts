import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill snapshot columns that were added to VariantProductionGrade after
 * it had already been applied to some databases.
 */
export class AddSnapshotColumns1779850000000 implements MigrationInterface {
  name = 'AddSnapshotColumns1779850000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_cart_items"
        ADD COLUMN IF NOT EXISTS "optionsSnapshot"             JSONB    NULL,
        ADD COLUMN IF NOT EXISTS "compareAtPriceCentsSnapshot" INTEGER  NULL
    `);

    await runner.query(`
      ALTER TABLE "shop_order_items"
        ADD COLUMN IF NOT EXISTS "optionsSnapshot"             JSONB    NULL,
        ADD COLUMN IF NOT EXISTS "compareAtPriceCentsSnapshot" INTEGER  NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_cart_items"
        DROP COLUMN IF EXISTS "compareAtPriceCentsSnapshot",
        DROP COLUMN IF EXISTS "optionsSnapshot"
    `);

    await runner.query(`
      ALTER TABLE "shop_order_items"
        DROP COLUMN IF EXISTS "compareAtPriceCentsSnapshot",
        DROP COLUMN IF EXISTS "optionsSnapshot"
    `);
  }
}
