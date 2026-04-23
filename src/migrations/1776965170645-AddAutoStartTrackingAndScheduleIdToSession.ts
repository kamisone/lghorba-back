import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutoStartTrackingAndScheduleIdToSession1776965170645 implements MigrationInterface {
    name = 'AddAutoStartTrackingAndScheduleIdToSession1776965170645'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "autoStartTracking" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ADD "scheduleId" uuid`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ADD CONSTRAINT "FK_715ecb16bae2a5c423cc8b4640e" FOREIGN KEY ("scheduleId") REFERENCES "rent_schedules"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_sessions" DROP CONSTRAINT "FK_715ecb16bae2a5c423cc8b4640e"`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" DROP COLUMN "scheduleId"`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "autoStartTracking"`);
    }

}
