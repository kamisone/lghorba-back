import { MigrationInterface, QueryRunner } from 'typeorm';

export class MediaAssets1779000000000 implements MigrationInterface {
  name = 'MediaAssets1779000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS media_assets (
        id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        "storageKey"       VARCHAR(1000) NOT NULL UNIQUE,
        "originalFilename" VARCHAR(500)  NOT NULL,
        "mimeType"         VARCHAR(100)  NOT NULL,
        "sizeBytes"        INT          NOT NULL,
        width              INT,
        height             INT,
        "altText"          VARCHAR(500),
        tags               TEXT[]       NOT NULL DEFAULT '{}',
        checksum           VARCHAR(64),
        "uploadedBy"       VARCHAR(200),
        "createdAt"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_media_assets_mimeType   ON media_assets ("mimeType")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_media_assets_createdAt  ON media_assets ("createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_media_assets_checksum   ON media_assets (checksum) WHERE checksum IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS media_usages (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        "assetId"    UUID        NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        "entityType" VARCHAR(100) NOT NULL,
        "entityId"   UUID        NOT NULL,
        field        VARCHAR(100) NOT NULL,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_media_usages_assetId     ON media_usages ("assetId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_media_usages_entityType_entityId ON media_usages ("entityType", "entityId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS media_usages`);
    await queryRunner.query(`DROP TABLE IF EXISTS media_assets`);
  }
}
