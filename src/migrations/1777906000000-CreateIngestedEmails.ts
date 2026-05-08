import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIngestedEmails1777906000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ingested_emails (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "messageId"         VARCHAR(500) NOT NULL,
        "imapUid"           VARCHAR(50)  NULL,
        "fromAddress"       VARCHAR(500) NOT NULL,
        subject             VARCHAR(1000) NOT NULL,
        "receivedAt"        TIMESTAMPTZ NULL,
        "rawText"           TEXT NOT NULL DEFAULT '',
        "rawHtml"           TEXT NOT NULL DEFAULT '',
        provider            VARCHAR(50)  NULL,
        "extractedBooking"  JSONB        NULL,
        status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
        "errorMessage"      TEXT         NULL,
        "bookingId"         UUID         NULL,
        "reservationNumber" VARCHAR(100) NULL,
        "createdAt"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT uq_ingested_emails_message_id UNIQUE ("messageId")
      )
    `);

    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ingested_emails_status ON ingested_emails (status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ingested_emails_provider ON ingested_emails (provider)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ingested_emails_reservation ON ingested_emails (provider, "reservationNumber")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS ingested_emails`);
  }
}
