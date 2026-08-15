import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a mobile/desktop classification to shop_behavior_events, derived from
 * the request's User-Agent at write time (see device.util.ts). Powers the
 * "Device" column in the analytics detail modal.
 *
 * Nullable, no default: existing rows never had a User-Agent captured, and
 * some server-originated event types (checkout_started, test_checkout_blocked)
 * have no request in scope — they fall back to the order's clientUserAgent,
 * which may itself be null.
 */
export class AddDeviceToShopBehaviorEvents1786900000000 implements MigrationInterface {
  name = 'AddDeviceToShopBehaviorEvents1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events"
        ADD COLUMN IF NOT EXISTS "device" varchar(10)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events" DROP COLUMN IF EXISTS "device"
    `);
  }
}
