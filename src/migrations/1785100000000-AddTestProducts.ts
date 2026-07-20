import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Test products — demand validation before committing to inventory.
 *
 * A test product behaves like any other product in the storefront but can never
 * be paid for: the block is enforced server-side at the moment the customer
 * submits payment.
 *
 * `shop_orders.isTestOrder` is denormalised at order-creation time so the
 * payment block and the webhook refund backstop can decide without re-joining
 * order items on every call.
 *
 * Existing rows default to false — nothing already in the catalogue or in the
 * order history is retroactively treated as a test.
 */
export class AddTestProducts1785100000000 implements MigrationInterface {
  name = 'AddTestProducts1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "isTestProduct" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_products_isTestProduct"
      ON "shop_products" ("isTestProduct")
    `);

    await queryRunner.query(`
      ALTER TABLE "shop_orders"
        ADD COLUMN IF NOT EXISTS "isTestOrder" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_orders_isTestOrder"
      ON "shop_orders" ("isTestOrder")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shop_orders_isTestOrder"`);
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN IF EXISTS "isTestOrder"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shop_products_isTestProduct"`);
    await queryRunner.query(`ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "isTestProduct"`);
  }
}
