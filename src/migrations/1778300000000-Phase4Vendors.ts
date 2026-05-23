import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4Vendors1778300000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // shop_vendors
    await qr.query(`
      CREATE TABLE shop_vendors (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "businessName"   VARCHAR(300) NOT NULL,
        email            VARCHAR(300) NOT NULL,
        "passwordHash"   VARCHAR NOT NULL,
        description      TEXT,
        "logoKey"        VARCHAR(500),
        website          VARCHAR(500),
        status           VARCHAR(20) NOT NULL DEFAULT 'pending',
        "stripeConnectId" VARCHAR(100),
        "payoutsStatus"  VARCHAR(30) NOT NULL DEFAULT 'not_connected',
        "platformFeeBps" INT NOT NULL DEFAULT 1000,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX idx_shop_vendors_email ON shop_vendors (email)`);
    await qr.query(`CREATE INDEX idx_shop_vendors_status ON shop_vendors (status)`);

    // shop_vendor_payouts
    await qr.query(`
      CREATE TABLE shop_vendor_payouts (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "vendorId"         UUID NOT NULL,
        "orderId"          UUID NOT NULL,
        "orderItemId"      UUID,
        "grossCents"       INT NOT NULL,
        "platformFeeCents" INT NOT NULL,
        "netCents"         INT NOT NULL,
        status             VARCHAR(20) NOT NULL DEFAULT 'pending',
        "stripeTransferId" VARCHAR(200),
        "failureReason"    TEXT,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX idx_svp_vendor ON shop_vendor_payouts ("vendorId")`);
    await qr.query(`CREATE INDEX idx_svp_order  ON shop_vendor_payouts ("orderId")`);
    await qr.query(`
      CREATE UNIQUE INDEX idx_svp_transfer
      ON shop_vendor_payouts ("stripeTransferId")
      WHERE "stripeTransferId" IS NOT NULL
    `);

    // add vendorId to shop_products
    await qr.query(`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS "vendorId" UUID`);

    // add vendorId snapshot to shop_order_items
    await qr.query(`ALTER TABLE shop_order_items ADD COLUMN IF NOT EXISTS "vendorId" UUID`);

    // add platformFeeBps to shop_orders (default 1000 = 10%)
    await qr.query(`ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS "platformFeeBps" INT NOT NULL DEFAULT 1000`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE shop_orders       DROP COLUMN IF EXISTS "platformFeeBps"`);
    await qr.query(`ALTER TABLE shop_order_items  DROP COLUMN IF EXISTS "vendorId"`);
    await qr.query(`ALTER TABLE shop_products     DROP COLUMN IF EXISTS "vendorId"`);
    await qr.query(`DROP TABLE IF EXISTS shop_vendor_payouts`);
    await qr.query(`DROP TABLE IF EXISTS shop_vendors`);
  }
}
