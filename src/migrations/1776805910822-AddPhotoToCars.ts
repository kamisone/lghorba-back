import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPhotoToCars1776805910822 implements MigrationInterface {
    name = 'AddPhotoToCars1776805910822'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cars" ADD "photo" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "photo"`);
    }

}
