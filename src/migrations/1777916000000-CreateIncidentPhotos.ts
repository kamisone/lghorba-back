import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIncidentPhotos1777916000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS incident_photos (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "incidentId"    UUID         NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        "gcsObjectName" VARCHAR(500) NOT NULL,
        caption         VARCHAR(300) NULL,
        "uploadedAt"    TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_incident_photos ON incident_photos ("incidentId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS incident_photos`);
  }
}
