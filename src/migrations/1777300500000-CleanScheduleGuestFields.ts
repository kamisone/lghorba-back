import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanScheduleGuestFields1777300500000 implements MigrationInterface {
  name = 'CleanScheduleGuestFields1777300500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN IF EXISTS "guestName"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN IF EXISTS "guestNumber"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN IF EXISTS "guestEmail"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN IF EXISTS "turoJoinDate"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN IF EXISTS "getaroundJoinDate"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "getaroundJoinDate" date`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "turoJoinDate" date`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "guestEmail" varchar`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "guestNumber" varchar`);
    await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "guestName" varchar`);
  }
}
