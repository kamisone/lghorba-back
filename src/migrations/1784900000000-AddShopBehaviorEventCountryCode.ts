import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopBehaviorEventCountryCode1784900000000
  implements MigrationInterface
{
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE shop_behavior_events ADD "countryCode" varchar(2)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_behavior_events_countryCode" ON shop_behavior_events ("countryCode");`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DROP INDEX IF EXISTS "IDX_shop_behavior_events_countryCode";`,
    );
    await qr.query(
      `ALTER TABLE shop_behavior_events DROP COLUMN "countryCode";`,
    );
  }
}
