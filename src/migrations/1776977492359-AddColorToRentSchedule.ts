import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColorToRentSchedule1776977492359 implements MigrationInterface {
    name = 'AddColorToRentSchedule1776977492359'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "color" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "color"`);
    }

}
