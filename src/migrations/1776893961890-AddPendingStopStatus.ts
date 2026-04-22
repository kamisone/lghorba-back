import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPendingStopStatus1776893961890 implements MigrationInterface {
    name = 'AddPendingStopStatus1776893961890'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."rent_sessions_status_enum" RENAME TO "rent_sessions_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."rent_sessions_status_enum" AS ENUM('active', 'pending_stop', 'ended')`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" TYPE "public"."rent_sessions_status_enum" USING "status"::"text"::"public"."rent_sessions_status_enum"`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."rent_sessions_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."rent_sessions_status_enum_old" AS ENUM('active', 'ended')`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" TYPE "public"."rent_sessions_status_enum_old" USING "status"::"text"::"public"."rent_sessions_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."rent_sessions_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."rent_sessions_status_enum_old" RENAME TO "rent_sessions_status_enum"`);
    }

}
