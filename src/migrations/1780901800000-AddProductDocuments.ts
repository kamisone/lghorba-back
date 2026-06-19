import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductDocuments1780901800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" ADD "documents" jsonb NOT NULL DEFAULT '[]'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" DROP COLUMN "documents"`);
  }
}
