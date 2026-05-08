import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaintenanceTypes1777908000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS maintenance_types (
        id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
        name                VARCHAR(200)   NOT NULL,
        code                VARCHAR(100)   NOT NULL,
        description         TEXT           NULL,
        "defaultCostEur"    DECIMAL(10,2)  NULL,
        "intervalDays"      INT            NULL,
        "intervalKm"        INT            NULL,
        "isActive"          BOOLEAN        NOT NULL DEFAULT true,
        "createdAt"         TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT uq_maintenance_types_code UNIQUE (code)
      )
    `);

    // Seed standard types
    const types = [
      ['oil_change',            'Oil Change',            null, 365, 15000],
      ['brake_inspection',      'Brake Inspection',      null, 365, 30000],
      ['tire_replacement',      'Tire Replacement',      null, 730, 40000],
      ['battery_replacement',   'Battery Replacement',   null, 1095, null],
      ['cleaning',              'Cleaning / Preparation', null, null, null],
      ['repair',                'Repair',                null, null, null],
      ['technical_inspection',  'Technical Inspection',  null, 730, null],
    ] as const;

    for (const [code, name, cost, days, km] of types) {
      await qr.query(`
        INSERT INTO maintenance_types (name, code, "defaultCostEur", "intervalDays", "intervalKm")
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO NOTHING
      `, [name, code, cost, days, km]);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS maintenance_types`);
  }
}
