import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToRentSession1777300600000 implements MigrationInterface {
  name = 'AddUserIdToRentSession1777300600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_sessions" ADD "userId" uuid`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ADD CONSTRAINT "FK_rent_sessions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_sessions" DROP CONSTRAINT "FK_rent_sessions_userId"`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" DROP COLUMN "userId"`);
  }
}
