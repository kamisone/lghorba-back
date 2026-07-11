import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaAssetTranscodeFields1783000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media_assets" ADD "hlsKey" character varying(1000)`);
    await queryRunner.query(`ALTER TABLE "media_assets" ADD "mp4Key" character varying(1000)`);
    await queryRunner.query(`ALTER TABLE "media_assets" ADD "autoPosterKey" character varying(1000)`);
    await queryRunner.query(`ALTER TABLE "media_assets" ADD "transcodeStatus" character varying(20)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media_assets" DROP COLUMN "transcodeStatus"`);
    await queryRunner.query(`ALTER TABLE "media_assets" DROP COLUMN "autoPosterKey"`);
    await queryRunner.query(`ALTER TABLE "media_assets" DROP COLUMN "mp4Key"`);
    await queryRunner.query(`ALTER TABLE "media_assets" DROP COLUMN "hlsKey"`);
  }
}
