import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTranslations1777301200000 implements MigrationInterface {
  name = 'CreateTranslations1777301200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "translations" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "entityType" varchar(100) NOT NULL,
        "entityId"   varchar      NOT NULL,
        "field"      varchar(100) NOT NULL,
        "value"      text         NOT NULL,
        "lang"       varchar(10)  NOT NULL,
        "createdAt"  TIMESTAMP    NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_translations"                    PRIMARY KEY ("id"),
        CONSTRAINT "UQ_translations_entity_field_lang"  UNIQUE      ("entityType", "entityId", "field", "lang")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_translations_entity" ON "translations" ("entityType", "entityId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_translations_lang" ON "translations" ("lang")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_translations_lang"`);
    await queryRunner.query(`DROP INDEX "IDX_translations_entity"`);
    await queryRunner.query(`DROP TABLE "translations"`);
  }
}
