import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSmsMessages1713534000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sms_messages" (
        "id" SERIAL PRIMARY KEY,
        "to" VARCHAR NOT NULL,
        "message" TEXT NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sms_messages"`);
  }
}
