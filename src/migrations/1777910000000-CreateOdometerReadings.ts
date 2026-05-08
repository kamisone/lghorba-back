import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOdometerReadings1777910000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS odometer_readings (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "carId"      UUID        NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        "readingKm"  INT         NOT NULL,
        "recordedAt" TIMESTAMPTZ NOT NULL,
        source       VARCHAR(50) NOT NULL DEFAULT 'manual',
        notes        TEXT        NULL,
        "createdBy"  VARCHAR(200) NULL,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_odometer_car_date ON odometer_readings ("carId", "recordedAt" DESC)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS odometer_readings`);
  }
}
