import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderLocale1780200000000 implements MigrationInterface {
  name = 'AddOrderLocale1780200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_orders"
        ADD COLUMN IF NOT EXISTS "customerLocale" varchar(10) NOT NULL DEFAULT 'fr'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_orders" DROP COLUMN IF EXISTS "customerLocale"
    `);
  }
}
