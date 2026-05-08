import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInspectionChecklistItems1777913000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS inspection_checklist_items (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "inspectionId" UUID        NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        category       VARCHAR(100) NOT NULL,
        "itemLabel"    VARCHAR(300) NOT NULL,
        status         VARCHAR(20)  NOT NULL DEFAULT 'not_checked',
        note           TEXT         NULL,
        "sortOrder"    SMALLINT     NOT NULL DEFAULT 0
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_checklist_inspection ON inspection_checklist_items ("inspectionId", "sortOrder")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS inspection_checklist_items`);
  }
}
