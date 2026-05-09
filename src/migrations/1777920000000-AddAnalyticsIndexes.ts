import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance indexes for the analytics module.
 * These cover the GROUP BY / WHERE patterns used in analytics queries.
 */
export class AddAnalyticsIndexes1777920000000 implements MigrationInterface {
  name = 'AddAnalyticsIndexes1777920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // rent_sessions: filter by startedAt + status (most common analytics pattern)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_sessions_startedAt_status"
      ON "rent_sessions" ("startedAt", "status")
    `);

    // rent_sessions: group by carId within a date range
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_sessions_carId_startedAt"
      ON "rent_sessions" ("carId", "startedAt")
    `);

    // rent_positions: count positions per session
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rent_positions_sessionId"
      ON "rent_positions" ("sessionId")
    `);

    // bookings: filter by startDateTime + status (revenue aggregation)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookings_startDateTime_status"
      ON "bookings" ("startDateTime", "status")
    `);

    // bookings: group by carId within a date range
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookings_carId_startDateTime"
      ON "bookings" ("carId", "startDateTime")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rent_sessions_startedAt_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rent_sessions_carId_startedAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rent_positions_sessionId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_startDateTime_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_carId_startDateTime"`);
  }
}
