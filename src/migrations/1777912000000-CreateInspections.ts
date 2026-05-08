import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInspections1777912000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS inspections (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "carId"            UUID        NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        "bookingId"        UUID        NULL REFERENCES bookings(id) ON DELETE SET NULL,
        "inspectionType"   VARCHAR(30) NOT NULL,
        "conductedAt"      TIMESTAMPTZ NOT NULL,
        "conductedBy"      VARCHAR(200) NULL,
        "odometerKm"       INT          NULL,
        "fuelLevelPct"     SMALLINT     NULL,
        "overallCondition" VARCHAR(30)  NULL,
        notes              TEXT         NULL,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_inspections_car ON inspections ("carId", "conductedAt" DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_inspections_booking ON inspections ("bookingId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS inspections`);
  }
}
