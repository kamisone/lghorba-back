import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePromotions1777923000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE promotions (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code          VARCHAR UNIQUE,
        name          VARCHAR NOT NULL,
        description   TEXT,
        type          VARCHAR NOT NULL,
        value         DECIMAL(10,2) NOT NULL,
        "isActive"    BOOLEAN NOT NULL DEFAULT true,
        "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
        "isStackable" BOOLEAN NOT NULL DEFAULT false,
        "isFirstBookingOnly" BOOLEAN NOT NULL DEFAULT false,
        "startsAt"    TIMESTAMPTZ,
        "expiresAt"   TIMESTAMPTZ,
        "maxUsages"   INT,
        "maxUsagesPerCustomer" INT,
        "minBookingAmount"  DECIMAL(10,2),
        "minBookingDays"    INT,
        "maxDiscountAmount" DECIMAL(10,2),
        "applicableCarIds"  JSONB,
        "usageCount"  INT NOT NULL DEFAULT 0,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`
      CREATE TABLE promotion_usages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "promotionId"   UUID NOT NULL,
        "bookingId"     UUID NOT NULL,
        "userId"        UUID,
        "customerEmail" VARCHAR,
        "discountAmount" DECIMAL(10,2) NOT NULL,
        "originalAmount" DECIMAL(10,2) NOT NULL,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`CREATE INDEX idx_promotion_usages_promotion ON promotion_usages ("promotionId")`);
    await qr.query(`CREATE INDEX idx_promotion_usages_booking   ON promotion_usages ("bookingId")`);
    await qr.query(`CREATE INDEX idx_promotions_code            ON promotions (code) WHERE code IS NOT NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS promotion_usages`);
    await qr.query(`DROP TABLE IF EXISTS promotions`);
  }
}
