import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoryNarrativeTitle1780902200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" ADD "storyNarrativeTitle" character varying(300)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" DROP COLUMN "storyNarrativeTitle"`);
  }
}
