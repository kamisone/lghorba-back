import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeekendPricing1777301600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cars"
        ADD COLUMN IF NOT EXISTS "basePricePerWeekendDay" DECIMAL(10,2) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cars"
        DROP COLUMN IF EXISTS "basePricePerWeekendDay"
    `);
  }
}
