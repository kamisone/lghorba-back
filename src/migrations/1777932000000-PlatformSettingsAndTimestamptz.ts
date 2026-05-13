import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformSettingsAndTimestamptz1777932000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {

    // ── 1. Platform settings key/value store ──────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_settings" (
        "key"       VARCHAR(64) NOT NULL,
        "value"     TEXT        NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_platform_settings" PRIMARY KEY ("key")
      )
    `);

    // Seed default timezone so the service always has a value
    await queryRunner.query(`
      INSERT INTO "platform_settings" ("key", "value")
      VALUES ('business_timezone', 'Europe/Paris')
      ON CONFLICT ("key") DO NOTHING
    `);

    // ── 2. Fix bare TIMESTAMP columns → TIMESTAMP WITH TIME ZONE ─────────────
    // These columns were using bare TIMESTAMP (no TZ). The server runs in UTC,
    // so stored values are already UTC — we just change the type to make the
    // intention explicit and enable correct AT TIME ZONE queries.

    await queryRunner.query(`
      ALTER TABLE "rent_sessions"
        ALTER COLUMN "endedAt"                   TYPE TIMESTAMP WITH TIME ZONE
          USING "endedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "lastLocationRequestedAt"   TYPE TIMESTAMP WITH TIME ZONE
          USING "lastLocationRequestedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "nextLocationAt"            TYPE TIMESTAMP WITH TIME ZONE
          USING "nextLocationAt" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "rent_positions"
        ALTER COLUMN "recordedAt" TYPE TIMESTAMP WITH TIME ZONE
          USING "recordedAt" AT TIME ZONE 'UTC'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rent_positions"
        ALTER COLUMN "recordedAt" TYPE TIMESTAMP
          USING "recordedAt" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "rent_sessions"
        ALTER COLUMN "nextLocationAt"          TYPE TIMESTAMP
          USING "nextLocationAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "lastLocationRequestedAt" TYPE TIMESTAMP
          USING "lastLocationRequestedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "endedAt"                 TYPE TIMESTAMP
          USING "endedAt" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "platform_settings"`);
  }
}
