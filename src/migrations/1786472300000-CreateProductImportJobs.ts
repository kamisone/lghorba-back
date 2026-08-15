import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Staging table for the product import feature (Alibaba or any other
 * e-commerce URL). Holds scraped +
 * AI-generated draft content for admin review before a real shop_products
 * row is created — see ProductImportController#confirm.
 */
export class CreateProductImportJobs1786472300000
  implements MigrationInterface
{
  name = 'CreateProductImportJobs1786472300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_product_import_jobs" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sourceUrl"   varchar(2000) NOT NULL,
        "status"      varchar(30) NOT NULL DEFAULT 'queued',
        "draftContent" jsonb NOT NULL DEFAULT '{}',
        "errorMessage" text,
        "productId"   uuid,
        "createdBy"   varchar(200),
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "confirmedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_shop_product_import_jobs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_product_import_jobs_status"
        ON "shop_product_import_jobs" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_product_import_jobs_createdAt"
        ON "shop_product_import_jobs" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_product_import_jobs"`);
  }
}
