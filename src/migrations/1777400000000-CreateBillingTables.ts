import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillingTables1777400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Invoice number sequence ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
        START 1 INCREMENT 1 NO CYCLE
    `);

    // ── Tax rates ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tax_rates" (
        "id"          uuid          NOT NULL DEFAULT gen_random_uuid(),
        "countryCode" varchar(2)    NOT NULL,
        "serviceType" varchar       NOT NULL DEFAULT 'car_rental',
        "rate"        decimal(6,4)  NOT NULL,
        "label"       varchar       NOT NULL,
        "validFrom"   date          NOT NULL,
        "validTo"     date,
        "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "pk_tax_rates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tax_rates_lookup"
        ON "tax_rates" ("countryCode", "serviceType", "validFrom")
    `);

    // ── Invoices ──────────────────────────────────────────────────────────────
    // CREATE TYPE IF NOT EXISTS requires PG 14+; use a DO block for wider compat.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "invoices_status_enum" AS ENUM ('draft', 'issued', 'paid', 'void');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoices" (
        "id"               uuid          NOT NULL DEFAULT gen_random_uuid(),
        "invoiceNumber"    varchar                 UNIQUE,
        "bookingId"        uuid          NOT NULL,
        "paymentIntentId"  varchar,
        "status"           "invoices_status_enum" NOT NULL DEFAULT 'draft',
        -- financial
        "subtotalAmount"   decimal(12,2) NOT NULL,
        "taxAmount"        decimal(12,2) NOT NULL,
        "totalAmount"      decimal(12,2) NOT NULL,
        "currency"         varchar(3)    NOT NULL DEFAULT 'EUR',
        -- tax snapshot
        "taxRateSnapshot"  decimal(6,4)  NOT NULL,
        "taxRateLabel"     varchar       NOT NULL,
        "taxCountry"       varchar(2)    NOT NULL,
        -- customer snapshot
        "customerName"     varchar,
        "customerEmail"    varchar,
        -- seller snapshot
        "sellerName"       varchar       NOT NULL,
        "sellerAddress"    jsonb         NOT NULL,
        "sellerVatNumber"  varchar,
        "sellerSiret"      varchar,
        -- lifecycle
        "issuedAt"         timestamp with time zone,
        "paidAt"           timestamp with time zone,
        "voidedAt"         timestamp with time zone,
        -- delivery
        "pdfStoragePath"   varchar,
        "pdfGeneratedAt"   timestamp with time zone,
        "emailSentAt"      timestamp with time zone,
        "createdAt"        timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt"        timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "fk_invoices_booking" FOREIGN KEY ("bookingId")
          REFERENCES "bookings" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invoices_booking_id"
        ON "invoices" ("bookingId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invoices_status"
        ON "invoices" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invoices_payment_intent"
        ON "invoices" ("paymentIntentId")
        WHERE "paymentIntentId" IS NOT NULL
    `);

    // ── Invoice lines ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoice_lines" (
        "id"          uuid           NOT NULL DEFAULT gen_random_uuid(),
        "invoiceId"   uuid           NOT NULL,
        "description" varchar        NOT NULL,
        "quantity"    decimal(10,4)  NOT NULL,
        "unitPrice"   decimal(10,2)  NOT NULL,
        "subtotal"    decimal(12,2)  NOT NULL,
        "startDate"   date,
        "endDate"     date,
        "sortOrder"   int            NOT NULL DEFAULT 0,
        "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invoice_lines" PRIMARY KEY ("id"),
        CONSTRAINT "fk_invoice_lines_invoice" FOREIGN KEY ("invoiceId")
          REFERENCES "invoices" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invoice_lines_invoice_id"
        ON "invoice_lines" ("invoiceId")
    `);

    // ── Audit log ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoice_audit_logs" (
        "id"          uuid    NOT NULL DEFAULT gen_random_uuid(),
        "invoiceId"   uuid    NOT NULL,
        "action"      varchar NOT NULL,
        "actorType"   varchar NOT NULL,
        "actorId"     varchar,
        "metadata"    jsonb,
        "createdAt"   timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invoice_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_invoice_audit_logs_invoice" FOREIGN KEY ("invoiceId")
          REFERENCES "invoices" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_invoice_audit_logs_invoice_id"
        ON "invoice_audit_logs" ("invoiceId")
    `);

    // ── Seed: French TVA rates ────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "tax_rates" ("countryCode", "serviceType", "rate", "label", "validFrom", "validTo")
      VALUES
        ('FR', 'car_rental', 0.2000, 'TVA 20%', '2014-01-01', NULL)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "invoices_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tax_rates"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS invoice_number_seq`);
  }
}
