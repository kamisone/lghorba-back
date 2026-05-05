import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePageContents1777700000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE page_contents (
        id          uuid        NOT NULL DEFAULT uuid_generate_v4(),
        slug        varchar     NOT NULL,
        locale      varchar     NOT NULL,
        data        jsonb       NOT NULL DEFAULT '{}',
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_page_contents    PRIMARY KEY (id),
        CONSTRAINT uq_page_contents_sl UNIQUE (slug, locale)
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE page_contents`);
  }
}
