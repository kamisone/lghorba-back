import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommittedStockToInventory1780400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_inventory_items
        ADD COLUMN IF NOT EXISTS "committed" int NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE shop_inventory_movements
        ADD COLUMN IF NOT EXISTS "committedAfter" int NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE shop_inventory_movements
        DROP COLUMN IF EXISTS "committedAfter"
    `);
    await queryRunner.query(`
      ALTER TABLE shop_inventory_items
        DROP COLUMN IF EXISTS "committed"
    `);
  }
}
