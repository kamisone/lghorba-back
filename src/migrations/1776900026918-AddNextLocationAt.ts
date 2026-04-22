import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNextLocationAt1776900026918 implements MigrationInterface {
    name = 'AddNextLocationAt1776900026918'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_sessions" ADD "nextLocationAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_sessions" DROP COLUMN "nextLocationAt"`);
    }

}
