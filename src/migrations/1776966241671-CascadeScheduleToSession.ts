import { MigrationInterface, QueryRunner } from "typeorm";

export class CascadeScheduleToSession1776966241671 implements MigrationInterface {
    name = 'CascadeScheduleToSession1776966241671'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_sessions" DROP CONSTRAINT "FK_715ecb16bae2a5c423cc8b4640e"`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ADD CONSTRAINT "FK_715ecb16bae2a5c423cc8b4640e" FOREIGN KEY ("scheduleId") REFERENCES "rent_schedules"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_sessions" DROP CONSTRAINT "FK_715ecb16bae2a5c423cc8b4640e"`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ADD CONSTRAINT "FK_715ecb16bae2a5c423cc8b4640e" FOREIGN KEY ("scheduleId") REFERENCES "rent_schedules"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
