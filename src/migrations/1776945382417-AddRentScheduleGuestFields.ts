import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRentScheduleGuestFields1776945382417 implements MigrationInterface {
    name = 'AddRentScheduleGuestFields1776945382417'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "guestName" character varying`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "guestNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "reservationNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" ADD "totalEarning" numeric(10,2)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "totalEarning"`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "reservationNumber"`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "guestNumber"`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" DROP COLUMN "guestName"`);
    }

}
