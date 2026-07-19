import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShopBehaviorEvents1784800000000
  implements MigrationInterface
{
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_behavior_events (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "eventType"       VARCHAR(30)  NOT NULL,
        "cartToken"       VARCHAR(100) NULL,
        "shopCustomerId"  UUID         NULL,
        "productId"       UUID         NULL,
        quantity          INT          NULL,
        "searchQuery"     VARCHAR(500) NULL,
        "resultCount"     INT          NULL,
        "createdAt"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_behavior_events_type_createdAt" ON shop_behavior_events ("eventType", "createdAt");`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_behavior_events_productId"      ON shop_behavior_events ("productId");`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_behavior_events_cartToken"      ON shop_behavior_events ("cartToken");`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shop_behavior_events_shopCustomerId" ON shop_behavior_events ("shopCustomerId");`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS shop_behavior_events;`);
  }
}
