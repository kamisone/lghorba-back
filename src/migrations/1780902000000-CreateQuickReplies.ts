import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateQuickReplies1780902000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "quick_replies" (
        "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "title"      character varying(150) NOT NULL,
        "body"       text NOT NULL,
        "category"   character varying(64) NOT NULL DEFAULT 'general',
        "isActive"   boolean NOT NULL DEFAULT true,
        "usageCount" integer NOT NULL DEFAULT 0,
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_quick_replies_category" ON "quick_replies" ("category")`);
    await queryRunner.query(`CREATE INDEX "IDX_quick_replies_active" ON "quick_replies" ("isActive")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "quick_replies"`);
  }
}
