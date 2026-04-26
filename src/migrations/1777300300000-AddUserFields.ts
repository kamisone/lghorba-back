import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFields1777300300000 implements MigrationInterface {
  name = 'AddUserFields1777300300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "score" integer`);
    await queryRunner.query(`ALTER TABLE "users" ADD "turoJoinDate" date`);
    await queryRunner.query(`ALTER TABLE "users" ADD "getaroundJoinDate" date`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_name_phone" UNIQUE ("name", "phone")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_users_name_phone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "getaroundJoinDate"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "turoJoinDate"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "score"`);
  }
}
