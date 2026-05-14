import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenSupportTables1777941000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── SupportConversation additions ──────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE "support_conversations"
        ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "resolvedAt"      TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "archivedAt"      TIMESTAMP WITH TIME ZONE
    `);

    // ── SupportMessage additions ───────────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE "support_messages"
        ADD COLUMN IF NOT EXISTS "attachments" JSONB
    `);

    // Seen queries: conversations where some messages are still unread by admin
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_msgs_convId_readAt"
        ON "support_messages" ("conversationId", "readAt")
        WHERE "readAt" IS NULL
    `);

    // ── Audit log table ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_audit_logs" (
        "id"              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId"  UUID    NOT NULL,
        "adminId"         UUID,
        "action"          VARCHAR NOT NULL,
        "previousValue"   JSONB,
        "newValue"        JSONB,
        "note"            TEXT,
        "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_audit_convId"
        ON "support_audit_logs" ("conversationId", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "support_audit_logs"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_msgs_convId_readAt"`);
    await queryRunner.query(`
      ALTER TABLE "support_messages"
        DROP COLUMN IF EXISTS "attachments"
    `);
    await queryRunner.query(`
      ALTER TABLE "support_conversations"
        DROP COLUMN IF EXISTS "firstResponseAt",
        DROP COLUMN IF EXISTS "resolvedAt",
        DROP COLUMN IF EXISTS "archivedAt"
    `);
  }
}
