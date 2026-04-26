import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueScheduleIdOnSession1777300800000 implements MigrationInterface {
  name = 'UniqueScheduleIdOnSession1777300800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_sessions" ADD CONSTRAINT "UQ_rent_sessions_scheduleId" UNIQUE ("scheduleId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rent_sessions" DROP CONSTRAINT "UQ_rent_sessions_scheduleId"`);
  }
}
