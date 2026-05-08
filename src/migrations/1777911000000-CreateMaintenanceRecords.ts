import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaintenanceRecords1777911000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS maintenance_records (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        "carId"                 UUID          NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        "maintenanceTypeId"     UUID          NOT NULL REFERENCES maintenance_types(id) ON DELETE RESTRICT,
        "supplierId"            UUID          NULL REFERENCES maintenance_suppliers(id) ON DELETE SET NULL,
        "vehicleAvailabilityId" UUID          NULL REFERENCES vehicle_availabilities(id) ON DELETE SET NULL,
        status                  VARCHAR(30)   NOT NULL DEFAULT 'planned',
        title                   VARCHAR(300)  NOT NULL,
        description             TEXT          NULL,
        "scheduledDate"         DATE          NULL,
        "startedAt"             TIMESTAMPTZ   NULL,
        "completedAt"           TIMESTAMPTZ   NULL,
        "odometerAtServiceKm"   INT           NULL,
        "costEur"               DECIMAL(10,2) NULL,
        "invoiceRef"            VARCHAR(200)  NULL,
        notes                   TEXT          NULL,
        "createdAt"             TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_maintenance_car_status ON maintenance_records ("carId", status)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled   ON maintenance_records ("scheduledDate")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS maintenance_records`);
  }
}
