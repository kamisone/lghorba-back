import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaAssetTitleFr1780901500000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE media_assets
        ADD COLUMN IF NOT EXISTS "title" VARCHAR(500);
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE media_assets
        DROP COLUMN IF EXISTS "title";
    `);
  }
}
