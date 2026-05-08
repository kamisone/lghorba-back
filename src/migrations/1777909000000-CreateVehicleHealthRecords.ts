import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehicleHealthRecords1777909000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS vehicle_health_records (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "carId"         UUID        NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        status          VARCHAR(30) NOT NULL DEFAULT 'healthy',
        reason          TEXT        NULL,
        "lastCheckedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_vehicle_health_car UNIQUE ("carId")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_vehicle_health_status ON vehicle_health_records (status)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS vehicle_health_records`);
  }
}
