import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypeAndConsumedToSmsMessages1745100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "sms_messages_type_enum" AS ENUM ('outbound', 'inbound')`);
    await queryRunner.query(`
      ALTER TABLE "sms_messages"
        ADD COLUMN "type" "sms_messages_type_enum" NOT NULL DEFAULT 'outbound',
        ADD COLUMN "consumed" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sms_messages" DROP COLUMN "consumed", DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "sms_messages_type_enum"`);
  }
}
