import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduleGuestFields1777300400000 implements MigrationInterface {
  name = 'AddScheduleGuestFields1777300400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "guestEmail" varchar`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "turoJoinDate" date`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "getaroundJoinDate" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "getaroundJoinDate"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "turoJoinDate"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "guestEmail"`);
  }
}
