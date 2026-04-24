import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePendingStopStatus1777001619954 implements MigrationInterface {
  name = 'RemovePendingStopStatus1777001619954';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "rent_sessions" SET "status" = 'ended', "endedAt" = NOW() WHERE "status" = 'pending_stop'`);
    await queryRunner.query(`ALTER TYPE "public"."rent_sessions_status_enum" RENAME TO "rent_sessions_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."rent_sessions_status_enum" AS ENUM('active', 'paused', 'ended')`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" TYPE "public"."rent_sessions_status_enum" USING "status"::"text"::"public"."rent_sessions_status_enum"`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" SET DEFAULT 'active'`);
    await queryRunner.query(`DROP TYPE "public"."rent_sessions_status_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."rent_sessions_status_enum" RENAME TO "rent_sessions_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."rent_sessions_status_enum" AS ENUM('active', 'paused', 'pending_stop', 'ended')`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" TYPE "public"."rent_sessions_status_enum" USING "status"::"text"::"public"."rent_sessions_status_enum"`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" SET DEFAULT 'active'`);
    await queryRunner.query(`DROP TYPE "public"."rent_sessions_status_enum_old"`);
  }
}
