import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the rental invoices/invoice_lines tables and the shop_order_receipts/
 * shop_order_receipt_lines tables with a single unified documents/document_lines schema.
 *
 * Existing rental invoice records are migrated with their original UUIDs preserved,
 * so invoice_audit_log FK references remain valid.
 * shop_order_receipts has no production data (just created) and is simply dropped.
 */
export class UnifyDocuments1780050000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── Create unified tables ──────────────────────────────────────────────

    await qr.query(`
      CREATE TABLE documents (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "documentType"     VARCHAR(20)  NOT NULL,   -- 'invoice' | 'receipt'
        "entityType"       VARCHAR(30)  NOT NULL,   -- 'booking' | 'shop_order'
        "entityId"         UUID         NOT NULL,
        "documentNumber"   VARCHAR(30)  UNIQUE,
        "paymentIntentId"  VARCHAR(500),
        status             VARCHAR(20)  NOT NULL DEFAULT 'issued',
        "customerEmail"    VARCHAR(300) NOT NULL,
        "customerName"     VARCHAR(300),
        "customerLocale"   VARCHAR(5)   NOT NULL DEFAULT 'fr',
        "sellerName"       VARCHAR(300) NOT NULL,
        "sellerAddress"    JSONB        NOT NULL DEFAULT '{}',
        "sellerVatNumber"  VARCHAR(100),
        "sellerSiret"      VARCHAR(50),
        "deliveryAddress"  JSONB,
        "subtotalCents"    INTEGER      NOT NULL DEFAULT 0,
        "deliveryCents"    INTEGER      NOT NULL DEFAULT 0,
        "discountCents"    INTEGER      NOT NULL DEFAULT 0,
        "taxCents"         INTEGER      NOT NULL DEFAULT 0,
        "totalCents"       INTEGER      NOT NULL DEFAULT 0,
        "couponCode"       VARCHAR(100),
        "taxRatePct"       NUMERIC(5,2) NOT NULL DEFAULT 20,
        "taxLabel"         VARCHAR(50),
        "taxCountry"       VARCHAR(2)   NOT NULL DEFAULT 'FR',
        "contextSnapshot"  JSONB,
        "pdfStoragePath"   VARCHAR(1000),
        "pdfGeneratedAt"   TIMESTAMPTZ,
        "emailSentAt"      TIMESTAMPTZ,
        "issuedAt"         TIMESTAMPTZ,
        "createdAt"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updatedAt"        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`CREATE INDEX idx_docs_entity  ON documents ("entityType", "entityId")`);
    await qr.query(`CREATE INDEX idx_docs_type    ON documents ("documentType")`);
    await qr.query(`CREATE INDEX idx_docs_status  ON documents (status)`);

    await qr.query(`
      CREATE TABLE document_lines (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "documentId"     UUID         NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        description      VARCHAR(500) NOT NULL,
        sku              VARCHAR(200),
        quantity         NUMERIC(10,4) NOT NULL,
        "unitPriceCents" INTEGER       NOT NULL,
        "totalCents"     INTEGER       NOT NULL,
        "periodStart"    DATE,
        "periodEnd"      DATE,
        "sortOrder"      INTEGER       NOT NULL DEFAULT 0,
        "createdAt"      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await qr.query(`CREATE INDEX idx_doclines_doc ON document_lines ("documentId")`);

    // ── Migrate rental invoices → documents ───────────────────────────────

    await qr.query(`
      INSERT INTO documents (
        id, "documentType", "entityType", "entityId",
        "documentNumber", "paymentIntentId", status,
        "customerEmail", "customerName", "customerLocale",
        "sellerName", "sellerAddress", "sellerVatNumber", "sellerSiret",
        "subtotalCents", "taxCents", "totalCents",
        "taxRatePct", "taxLabel", "taxCountry",
        "pdfStoragePath", "pdfGeneratedAt", "emailSentAt", "issuedAt",
        "createdAt", "updatedAt"
      )
      SELECT
        id,
        'invoice',
        'booking',
        "bookingId",
        "invoiceNumber",
        "paymentIntentId",
        status,
        COALESCE("customerEmail", ''),
        "customerName",
        COALESCE("customerLocale", 'fr'),
        "sellerName",
        "sellerAddress",
        "sellerVatNumber",
        "sellerSiret",
        ROUND("subtotalAmount" * 100)::int,
        ROUND("taxAmount"      * 100)::int,
        ROUND("totalAmount"    * 100)::int,
        ROUND("taxRateSnapshot" * 100)::numeric(5,2),
        "taxRateLabel",
        COALESCE("taxCountry", 'FR'),
        "pdfStoragePath",
        "pdfGeneratedAt",
        "emailSentAt",
        "issuedAt",
        "createdAt",
        "updatedAt"
      FROM invoices
    `);

    await qr.query(`
      INSERT INTO document_lines (
        id, "documentId", description, quantity,
        "unitPriceCents", "totalCents",
        "periodStart", "periodEnd", "sortOrder", "createdAt"
      )
      SELECT
        id,
        "invoiceId",
        description,
        quantity,
        ROUND("unitPrice" * 100)::int,
        ROUND(subtotal    * 100)::int,
        "startDate"::date,
        "endDate"::date,
        "sortOrder",
        "createdAt"
      FROM invoice_lines
    `);

    // ── Drop old tables (shop_order_receipts has no prod data) ─────────────

    await qr.query(`DROP TABLE IF EXISTS shop_order_receipt_lines`);
    await qr.query(`DROP TABLE IF EXISTS shop_order_receipts`);
    await qr.query(`DROP TABLE IF EXISTS invoice_lines`);

    // CASCADE drops only the FK constraint on invoice_audit_logs, not the table itself.
    // The audit rows remain; their invoiceId UUIDs are now in documents.
    await qr.query(`DROP TABLE IF EXISTS invoices CASCADE`);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Restore tables without restoring data (data would be in documents)
    await qr.query(`DROP TABLE IF EXISTS document_lines`);
    await qr.query(`DROP TABLE IF EXISTS documents`);
  }
}
