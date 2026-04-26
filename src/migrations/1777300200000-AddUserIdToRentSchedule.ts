import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToRentSchedule1777300200000 implements MigrationInterface {
  name = 'AddUserIdToRentSchedule1777300200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "userId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "rent_schedules"
      ADD CONSTRAINT "FK_rent_schedules_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP CONSTRAINT "FK_rent_schedules_user"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "userId"`);
  }
}
