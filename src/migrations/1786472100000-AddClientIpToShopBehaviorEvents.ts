import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the raw client IP to shop_behavior_events, alongside the existing
 * one-way visitorHash. Needed so an admin reviewing event details can add an
 * unwanted/bot source straight to the analytics IP exclusion list — the hash
 * alone can't be turned back into a blockable address.
 *
 * Nullable, no default: existing rows stay hash-only (never had the address
 * captured), only events recorded after this ships carry a clientIp.
 */
export class AddClientIpToShopBehaviorEvents1786472100000 implements MigrationInterface {
  name = 'AddClientIpToShopBehaviorEvents1786472100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events"
        ADD COLUMN IF NOT EXISTS "clientIp" varchar(45)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events"
        DROP COLUMN IF EXISTS "clientIp"
    `);
  }
}
