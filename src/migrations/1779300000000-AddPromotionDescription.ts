import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromotionDescription1779300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_promotions
        ADD COLUMN IF NOT EXISTS "description" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_promotions
        DROP COLUMN IF EXISTS "description"
    `);
  }
}
