import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerGroups1778900000000 implements MigrationInterface {
  name = 'CustomerGroups1778900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shop_customer_groups (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name         VARCHAR(200) NOT NULL,
        description  TEXT,
        criteria     JSONB,
        "isActive"   BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS shop_customer_groups`);
  }
}
