import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSpamLogs1777991000000 implements MigrationInterface {
  name = 'CreateSpamLogs1777991000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "spam_logs" (
        "id"        UUID         DEFAULT gen_random_uuid() NOT NULL,
        "ip"        VARCHAR(50),
        "score"     INT          NOT NULL,
        "decision"  VARCHAR(20)  NOT NULL,
        "reasons"   TEXT,
        "userAgent" VARCHAR(500),
        "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_spam_logs" PRIMARY KEY ("id")
      )
    `);
    await qr.query(`CREATE INDEX "IDX_spam_logs_decision"  ON "spam_logs" ("decision")`);
    await qr.query(`CREATE INDEX "IDX_spam_logs_ip"        ON "spam_logs" ("ip")`);
    await qr.query(`CREATE INDEX "IDX_spam_logs_createdAt" ON "spam_logs" ("createdAt")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "spam_logs"`);
  }
}
