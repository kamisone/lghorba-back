import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehicleAvailabilities1777903000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS vehicle_availabilities (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "carId"             UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        "startDate"         DATE NOT NULL,
        "endDate"           DATE NOT NULL,
        reason              VARCHAR,
        notes               TEXT,
        "createdByAdminId"  UUID REFERENCES admins(id) ON DELETE SET NULL,
        "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_va_car_dates ON vehicle_availabilities ("carId", "startDate", "endDate")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS vehicle_availabilities`);
  }
}
