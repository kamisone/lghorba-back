import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two indexes the every-minute rent-session crons were missing:
 *
 * - IDX_rent_sessions_trackingPaused_nextLocationAt: sendLocationRequests
 *   filters exactly this pair (trackingPaused = false AND nextLocationAt <= now).
 * - IDX_rent_sessions_status: endExpiredScheduledSessions filters status = ACTIVE
 *   across the whole table with no other leading column to piggyback on.
 *
 * carId and bookingId are deliberately left alone here — the schema already
 * has IDX_rent_sessions_carId_startedAt and a unique index on bookingId
 * (added out-of-band, not reflected in rent-session.entity.ts), so adding
 * more indexes on those columns would just be redundant write overhead.
 */
export class AddRentSessionPerfIndexes1786472000000 implements MigrationInterface {
  name = 'AddRentSessionPerfIndexes1786472000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_sessions_trackingPaused_nextLocationAt"
        ON "rent_sessions" ("trackingPaused", "nextLocationAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_sessions_status"
        ON "rent_sessions" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rent_sessions_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rent_sessions_trackingPaused_nextLocationAt"`);
  }
}
