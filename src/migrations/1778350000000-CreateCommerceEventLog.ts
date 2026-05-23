import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommerceEventLog1778350000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS commerce_event_log (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "eventName" VARCHAR(200) NOT NULL,
        "entityId"  UUID,
        payload     JSONB,
        source      VARCHAR(200),
        status      VARCHAR(20) NOT NULL DEFAULT 'success',
        error       TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_commerce_event_log_eventName_createdAt"
      ON commerce_event_log ("eventName", "createdAt")`);

    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_commerce_event_log_entityId"
      ON commerce_event_log ("entityId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS commerce_event_log`);
  }
}
