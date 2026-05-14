import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportTables1777940000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "support_conversations" (
        "id"               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        "guestToken"       VARCHAR NOT NULL UNIQUE,
        "guestName"        VARCHAR,
        "assignedAdminId"  UUID,
        "status"           VARCHAR NOT NULL DEFAULT 'waiting_admin',
        "lastMessageAt"    TIMESTAMP WITH TIME ZONE,
        "unreadAdminCount" INT NOT NULL DEFAULT 0,
        "unreadGuestCount" INT NOT NULL DEFAULT 0,
        "lastNotifiedAt"   TIMESTAMP WITH TIME ZONE,
        "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_support_conv_status_lastMsg"
        ON "support_conversations" ("status", "lastMessageAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_support_conv_unread_lastMsg"
        ON "support_conversations" ("unreadAdminCount", "lastMessageAt" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "support_messages" (
        "id"             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId" UUID    NOT NULL REFERENCES "support_conversations"("id") ON DELETE CASCADE,
        "senderType"     VARCHAR NOT NULL,
        "senderId"       UUID,
        "content"        TEXT    NOT NULL,
        "readAt"         TIMESTAMP WITH TIME ZONE,
        "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_support_msgs_convId_createdAt"
        ON "support_messages" ("conversationId", "createdAt" ASC)
    `);

    await queryRunner.query(`
      CREATE TABLE "support_notification_logs" (
        "id"               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversationId"   UUID    NOT NULL,
        "notificationType" VARCHAR NOT NULL,
        "status"           VARCHAR NOT NULL,
        "retries"          INT NOT NULL DEFAULT 0,
        "providerResponse" TEXT,
        "metadata"         JSONB,
        "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_support_notif_convId"
        ON "support_notification_logs" ("conversationId", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "support_notification_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_conversations"`);
  }
}
