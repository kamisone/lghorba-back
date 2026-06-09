import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShopOrderReceipts1780000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Sequential number generator for receipt numbers (REC-YYYY-NNNNNN)
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS shop_receipt_seq START 1 INCREMENT 1 NO CYCLE`);

    await qr.query(`
      CREATE TABLE shop_order_receipts (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "receiptNumber"    VARCHAR(30) UNIQUE,
        "orderId"          UUID NOT NULL REFERENCES shop_orders(id) ON DELETE RESTRICT,
        "paymentIntentId"  VARCHAR(500),
        status             VARCHAR(20) NOT NULL DEFAULT 'draft',

        "customerEmail"    VARCHAR(300) NOT NULL,
        "customerName"     VARCHAR(300),
        "customerLocale"   VARCHAR(5)  NOT NULL DEFAULT 'fr',

        "sellerName"       VARCHAR(300) NOT NULL,
        "sellerAddress"    JSONB        NOT NULL DEFAULT '{}',
        "sellerVatNumber"  VARCHAR(100),
        "sellerSiret"      VARCHAR(50),

        "shippingAddress"  JSONB,

        "subtotalCents"    INTEGER NOT NULL DEFAULT 0,
        "shippingCents"    INTEGER NOT NULL DEFAULT 0,
        "discountCents"    INTEGER NOT NULL DEFAULT 0,
        "taxCents"         INTEGER NOT NULL DEFAULT 0,
        "totalCents"       INTEGER NOT NULL DEFAULT 0,

        "taxRatePct"       NUMERIC(5,2) NOT NULL DEFAULT 20,
        "taxLabel"         VARCHAR(50),
        "taxCountry"       VARCHAR(2)   NOT NULL DEFAULT 'FR',
        "couponCode"       VARCHAR(100),

        "pdfStoragePath"   VARCHAR(1000),
        "pdfGeneratedAt"   TIMESTAMPTZ,
        "emailSentAt"      TIMESTAMPTZ,
        "issuedAt"         TIMESTAMPTZ,

        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`CREATE INDEX idx_sor_order  ON shop_order_receipts ("orderId")`);
    await qr.query(`CREATE INDEX idx_sor_status ON shop_order_receipts (status)`);

    await qr.query(`
      CREATE TABLE shop_order_receipt_lines (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "receiptId"      UUID NOT NULL REFERENCES shop_order_receipts(id) ON DELETE CASCADE,
        description      VARCHAR(500) NOT NULL,
        sku              VARCHAR(200),
        quantity         INTEGER      NOT NULL,
        "unitPriceCents" INTEGER      NOT NULL,
        "totalCents"     INTEGER      NOT NULL,
        "sortOrder"      INTEGER      NOT NULL DEFAULT 0,
        "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`CREATE INDEX idx_sorl_receipt ON shop_order_receipt_lines ("receiptId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS shop_order_receipt_lines`);
    await qr.query(`DROP TABLE IF EXISTS shop_order_receipts`);
    await qr.query(`DROP SEQUENCE IF EXISTS shop_receipt_seq`);
  }
}
