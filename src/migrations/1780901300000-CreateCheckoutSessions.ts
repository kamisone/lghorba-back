import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCheckoutSessions1780901300000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS checkout_sessions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "cartToken"     VARCHAR(36)  NOT NULL,
        "orderId"       UUID         NULL,
        step            VARCHAR(20)  NOT NULL DEFAULT 'address',
        "formSnapshot"  JSONB        NULL,
        locale          VARCHAR(10)  NOT NULL DEFAULT 'fr',
        "resumeToken"   UUID         NOT NULL,
        "expiresAt"     TIMESTAMPTZ  NOT NULL,
        "completedAt"   TIMESTAMPTZ  NULL,
        "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_checkout_sessions_cartToken"  ON checkout_sessions ("cartToken");`);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_checkout_sessions_resumeToken" ON checkout_sessions ("resumeToken");`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_checkout_sessions_orderId"    ON checkout_sessions ("orderId");`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_checkout_sessions_expiresAt"  ON checkout_sessions ("expiresAt");`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS checkout_sessions;`);
  }
}
