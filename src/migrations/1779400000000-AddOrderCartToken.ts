import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderCartToken1779400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_orders
        ADD COLUMN IF NOT EXISTS "cartToken" varchar(100) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "reservationExpiresAt" timestamptz DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_orders
        DROP COLUMN IF EXISTS "cartToken",
        DROP COLUMN IF EXISTS "reservationExpiresAt"
    `);
  }
}
