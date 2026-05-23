import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderReservationExpiry1779500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_orders
        ADD COLUMN IF NOT EXISTS "reservationExpiresAt" timestamptz DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_orders
        DROP COLUMN IF EXISTS "reservationExpiresAt"
    `);
  }
}
