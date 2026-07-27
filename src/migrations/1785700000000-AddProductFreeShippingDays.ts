import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery window advertised for a product's free shipping.
 *
 * The free option is synthetic — it is not one of the zone's shipping methods
 * (see ShippingService.buildFreeShippingOptions) — so until now it borrowed its
 * estimate from whichever method happened to be in the zone. That is a guess;
 * free delivery is usually the slow carrier and deserves its own promise.
 *
 * Nullable: when unset the previous borrowed-estimate behaviour still applies,
 * so existing free-shipping products keep working untouched.
 */
export class AddProductFreeShippingDays1785700000000 implements MigrationInterface {
  name = 'AddProductFreeShippingDays1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "freeShippingDaysMin" integer,
        ADD COLUMN IF NOT EXISTS "freeShippingDaysMax" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_products"
        DROP COLUMN IF EXISTS "freeShippingDaysMax",
        DROP COLUMN IF EXISTS "freeShippingDaysMin"
    `);
  }
}
