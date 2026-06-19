import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationPageUrl1780901600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "support_conversations" ADD "pageUrl" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "support_conversations" DROP COLUMN "pageUrl"`);
  }
}
