import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInspectionPhotos1777914000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS inspection_photos (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "inspectionId"   UUID         NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        "gcsObjectName"  VARCHAR(500) NOT NULL,
        caption          VARCHAR(300) NULL,
        "uploadedAt"     TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_inspection_photos ON inspection_photos ("inspectionId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS inspection_photos`);
  }
}
