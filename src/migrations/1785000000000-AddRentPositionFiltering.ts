import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plausibility filtering for inbound GPS positions.
 *
 * Suspect positions are flagged rather than dropped: the corroboration stage of
 * the filter needs the previous rejected point to compare against, and keeping
 * them gives an audit trail for tuning the thresholds.
 *
 * Existing rows default to rejected = false — historical data is not
 * retroactively judged.
 */
export class AddRentPositionFiltering1785000000000 implements MigrationInterface {
  name = 'AddRentPositionFiltering1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rent_positions"
        ADD COLUMN IF NOT EXISTS "rejected" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "rejectReason" text,
        ADD COLUMN IF NOT EXISTS "impliedSpeedKmh" numeric(10,2)
    `);

    // Ordered reads of a session's track.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_positions_session_recordedAt"
      ON "rent_positions" ("sessionId", "recordedAt" DESC)
    `);

    // Per-insert lookups: latest accepted position, and latest rejected one.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_positions_session_rejected_recordedAt"
      ON "rent_positions" ("sessionId", "rejected", "recordedAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rent_positions_session_rejected_recordedAt"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rent_positions_session_recordedAt"`);
    await queryRunner.query(`
      ALTER TABLE "rent_positions"
        DROP COLUMN IF EXISTS "impliedSpeedKmh",
        DROP COLUMN IF EXISTS "rejectReason",
        DROP COLUMN IF EXISTS "rejected"
    `);
  }
}
