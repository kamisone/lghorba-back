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
