import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Background jobs backing the product-edit page's "Generate" buttons (content,
 * specifications, FAQs, story gallery) — persisted so a page refresh mid-
 * generation can resume polling instead of losing the in-flight request.
 */
export class CreateSectionGenerationJobs1786789861000
  implements MigrationInterface
{
  name = 'CreateSectionGenerationJobs1786789861000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_section_generation_jobs" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kind"          varchar(40) NOT NULL,
        "status"        varchar(20) NOT NULL DEFAULT 'queued',
        "inputPayload"  jsonb NOT NULL,
        "resultPayload" jsonb,
        "errorMessage"  text,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_section_generation_jobs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_section_generation_jobs_status_createdAt"
        ON "shop_section_generation_jobs" ("status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_section_generation_jobs"`);
  }
}
