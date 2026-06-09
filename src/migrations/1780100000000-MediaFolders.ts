import { MigrationInterface, QueryRunner } from 'typeorm';

export class MediaFolders1780100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "media_folders" (
        "id"         uuid        NOT NULL DEFAULT gen_random_uuid(),
        "name"       varchar(200) NOT NULL,
        "parent_id"  uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_media_folders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_media_folders_parent"
          FOREIGN KEY ("parent_id") REFERENCES "media_folders"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_media_folders_parent_id" ON "media_folders" ("parent_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "media_assets"
        ADD COLUMN "folder_id" uuid,
        ADD CONSTRAINT "FK_media_assets_folder"
          FOREIGN KEY ("folder_id") REFERENCES "media_folders"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_media_assets_folder_id" ON "media_assets" ("folder_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_assets_folder_id"`);
    await queryRunner.query(`ALTER TABLE "media_assets" DROP CONSTRAINT IF EXISTS "FK_media_assets_folder"`);
    await queryRunner.query(`ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "folder_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "media_folders"`);
  }
}
