import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paid upgrade alongside per-product free shipping.
 *
 * A free-shipping product always ships free, but the customer may still want it
 * faster. `shop_shipping_methods.availableForFreeShipping` marks the methods an
 * admin is allowed to offer as that upgrade, and
 * `shop_products.freeShippingUpgradeMethodId` is the one actually offered for a
 * given product (optional — null means free shipping is the only option).
 *
 * ON DELETE SET NULL: deleting a shipping method must not take products with it,
 * it just removes the upgrade offer.
 */
export class AddFreeShippingUpgradeMethod1785400000000 implements MigrationInterface {
  name = 'AddFreeShippingUpgradeMethod1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_shipping_methods"
        ADD COLUMN IF NOT EXISTS "availableForFreeShipping" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_shipping_methods_availableForFreeShipping"
      ON "shop_shipping_methods" ("availableForFreeShipping")
    `);

    await queryRunner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "freeShippingUpgradeMethodId" uuid
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_shop_products_freeShippingUpgradeMethod'
        ) THEN
          ALTER TABLE "shop_products"
            ADD CONSTRAINT "FK_shop_products_freeShippingUpgradeMethod"
            FOREIGN KEY ("freeShippingUpgradeMethodId")
            REFERENCES "shop_shipping_methods"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        DROP CONSTRAINT IF EXISTS "FK_shop_products_freeShippingUpgradeMethod"
    `);
    await queryRunner.query(`
      ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "freeShippingUpgradeMethodId"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_shop_shipping_methods_availableForFreeShipping"`,
    );
    await queryRunner.query(`
      ALTER TABLE "shop_shipping_methods"
        DROP COLUMN IF EXISTS "availableForFreeShipping"
    `);
  }
}
