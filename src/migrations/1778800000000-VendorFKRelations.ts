import { MigrationInterface, QueryRunner } from 'typeorm';

export class VendorFKRelations1778800000000 implements MigrationInterface {
  name = 'VendorFKRelations1778800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // FK: shop_products.vendorId → shop_vendors.id
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_products_vendorId'
          AND table_name = 'shop_products'
        ) THEN
          ALTER TABLE shop_products
            ADD CONSTRAINT "FK_shop_products_vendorId"
            FOREIGN KEY ("vendorId") REFERENCES shop_vendors(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // FK: shop_order_items.vendorId → shop_vendors.id
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_order_items_vendorId'
          AND table_name = 'shop_order_items'
        ) THEN
          ALTER TABLE shop_order_items
            ADD CONSTRAINT "FK_shop_order_items_vendorId"
            FOREIGN KEY ("vendorId") REFERENCES shop_vendors(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE shop_products DROP CONSTRAINT IF EXISTS "FK_shop_products_vendorId"`);
    await queryRunner.query(`ALTER TABLE shop_order_items DROP CONSTRAINT IF EXISTS "FK_shop_order_items_vendorId"`);
  }
}
