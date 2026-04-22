import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastLocationRequestedAt1776893240809 implements MigrationInterface {
    name = 'AddLastLocationRequestedAt1776893240809'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_sessions" ADD "lastLocationRequestedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_sessions" DROP COLUMN "lastLocationRequestedAt"`);
    }

}
