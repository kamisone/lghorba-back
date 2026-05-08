import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIncidents1777915000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS incidents (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "carId"               UUID        NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        "bookingId"           UUID        NULL REFERENCES bookings(id) ON DELETE SET NULL,
        "inspectionId"        UUID        NULL REFERENCES inspections(id) ON DELETE SET NULL,
        "maintenanceRecordId" UUID        NULL REFERENCES maintenance_records(id) ON DELETE SET NULL,
        "incidentType"        VARCHAR(50) NOT NULL,
        severity              VARCHAR(20) NOT NULL DEFAULT 'minor',
        "reportedAt"          TIMESTAMPTZ NOT NULL,
        description           TEXT        NOT NULL,
        "repairRequired"      BOOLEAN     NOT NULL DEFAULT false,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_incidents_car ON incidents ("carId", "reportedAt" DESC)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS incidents`);
  }
}
