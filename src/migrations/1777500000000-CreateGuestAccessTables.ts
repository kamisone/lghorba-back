import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGuestAccessTables1777500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "guest_tokens" (
        "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        "tokenHash"          VARCHAR      NOT NULL,
        "label"              VARCHAR,
        "carId"              UUID         NOT NULL,
        "bookingId"          UUID,
        "allowedActions"     TEXT         NOT NULL,
        "expiresAt"          TIMESTAMPTZ  NOT NULL,
        "revokedAt"          TIMESTAMPTZ,
        "createdByAdminId"   UUID         NOT NULL,
        "usageCount"         INT          NOT NULL DEFAULT 0,
        "createdAt"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_guest_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_guest_tokens_tokenHash" UNIQUE ("tokenHash")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "guest_token_audit_logs" (
        "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tokenId"    UUID        NOT NULL,
        "action"     VARCHAR     NOT NULL,
        "success"    BOOLEAN     NOT NULL,
        "failReason" VARCHAR,
        "ipAddress"  VARCHAR,
        "userAgent"  VARCHAR,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_guest_token_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_guest_token_audit_tokenId" ON "guest_token_audit_logs" ("tokenId")`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_guest_token_audit_tokenId"`);
    await queryRunner.query(`DROP TABLE "guest_token_audit_logs"`);
    await queryRunner.query(`DROP TABLE "guest_tokens"`);
  }
}
