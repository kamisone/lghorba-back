import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillAndDropSchedules1777301800000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── 1. Backfill bookings from rent_schedules ──────────────────────────────
    // Each schedule becomes a booking with source='turo' (admin can correct).
    // We store the schedule id in a temp mapping so we can repoint sessions.
    await qr.query(`
      CREATE TEMP TABLE _sched_booking_map AS
      SELECT
        rs.id                                AS schedule_id,
        gen_random_uuid()                    AS booking_id,
        rs."carId",
        rs."fromDate" AT TIME ZONE 'UTC'     AS "startDateTime",
        rs."toDate"   AT TIME ZONE 'UTC'     AS "endDateTime",
        COALESCE(rs."totalEarning", 0)       AS "totalPrice",
        'confirmed'                          AS status,
        'turo'                               AS source,
        rs."userId",
        rs."reservationNumber",
        rs."totalEarning",
        rs."color",
        rs."autoStartTracking",
        u."name"                             AS "customerName",
        u."email"                            AS "customerEmail",
        u."phone"                            AS "customerPhone",
        rs."createdAt",
        rs."updatedAt"
      FROM rent_schedules rs
      LEFT JOIN users u ON u.id = rs."userId"
    `);

    // Dedup 1: cancel the later-created entry in every overlapping pair
    // within the backfill set itself.
    await qr.query(`
      UPDATE _sched_booking_map
      SET status = 'cancelled'
      WHERE booking_id IN (
        SELECT DISTINCT
          CASE WHEN m1."createdAt" <= m2."createdAt" THEN m2.booking_id ELSE m1.booking_id END
        FROM _sched_booking_map m1
        JOIN _sched_booking_map m2 ON (
          m1.booking_id < m2.booking_id
          AND m1."carId" = m2."carId"
          AND m1.status != 'cancelled'
          AND m2.status != 'cancelled'
          AND m1."startDateTime" < m2."endDateTime"
          AND m1."endDateTime"   > m2."startDateTime"
        )
      )
    `);

    // Dedup 2: cancel backfill entries that conflict with bookings already
    // in the table (created directly via the new bookings API).
    await qr.query(`
      UPDATE _sched_booking_map m
      SET status = 'cancelled'
      WHERE m.status != 'cancelled'
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b."carId" = m."carId"
            AND b.status != 'cancelled'
            AND b."startDateTime" < m."endDateTime"
            AND b."endDateTime"   > m."startDateTime"
        )
    `);

    await qr.query(`
      INSERT INTO bookings (
        id, "carId", "startDateTime", "endDateTime", "totalPrice", status, version,
        source, "userId", "reservationNumber", "totalEarning", "color", "autoStartTracking",
        "customerName", "customerEmail", "customerPhone",
        "createdAt", "updatedAt"
      )
      SELECT
        booking_id, "carId", "startDateTime", "endDateTime", "totalPrice", status::bookings_status_enum, 1,
        source, "userId", "reservationNumber", "totalEarning", "color", "autoStartTracking",
        "customerName", "customerEmail", "customerPhone",
        "createdAt", "updatedAt"
      FROM _sched_booking_map
    `);

    // ── 2. Repoint rent_sessions.bookingId from scheduleId ───────────────────
    await qr.query(`
      UPDATE rent_sessions rs
      SET "bookingId" = m.booking_id
      FROM _sched_booking_map m
      WHERE rs."scheduleId" = m.schedule_id
    `);

    // ── 3. Drop scheduleId from rent_sessions ─────────────────────────────────
    await qr.query(`ALTER TABLE rent_sessions DROP COLUMN IF EXISTS "scheduleId"`);

    // ── 4. Drop rent_schedules ────────────────────────────────────────────────
    await qr.query(`DROP TABLE IF EXISTS rent_schedules`);
  }

  async down(_qr: QueryRunner): Promise<void> {
    // Irreversible data migration — down is a no-op
  }
}
