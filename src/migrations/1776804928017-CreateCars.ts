import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCars1776804928017 implements MigrationInterface {
    name = 'CreateCars1776804928017'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "cars" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "immatriculation" character varying NOT NULL, "phoneNumber" character varying NOT NULL, "description" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fc218aa84e79b477d55322271b6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "sms_messages" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "sms_messages" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sms_messages" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "sms_messages" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`DROP TABLE "cars"`);
    }

}
