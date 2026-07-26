import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-product free shipping.
 *
 * Complements the two shipping-level mechanisms that already exist (a zone's
 * `freeShippingThresholdCents` and a method's `freeAboveCents`) and the
 * promotion-level `free_shipping` discount type. This one is a property of the
 * product itself: any cart containing such a product ships free, whatever the
 * order total.
 *
 * Indexed because the storefront filters on it to badge listings.
 */
export class AddProductFreeShipping1785300000000 implements MigrationInterface {
  name = 'AddProductFreeShipping1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "freeShipping" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_products_freeShipping"
      ON "shop_products" ("freeShipping")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shop_products_freeShipping"`);
    await queryRunner.query(
      `ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "freeShipping"`,
    );
  }
}
