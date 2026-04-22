import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRentSchedules1776898382208 implements MigrationInterface {
    name = 'CreateRentSchedules1776898382208'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "rent_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "carId" uuid NOT NULL, "fromDate" TIMESTAMP NOT NULL, "toDate" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_00d76edb781bf2024e882fc6371" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "rent_schedules" ADD CONSTRAINT "FK_5e5daf225f9b8831b286e3afb7b" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_schedules" DROP CONSTRAINT "FK_5e5daf225f9b8831b286e3afb7b"`);
        await queryRunner.query(`DROP TABLE "rent_schedules"`);
    }

}
