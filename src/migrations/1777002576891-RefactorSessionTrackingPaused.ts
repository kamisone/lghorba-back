import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorSessionTrackingPaused1777002576891 implements MigrationInterface {
  name = 'RefactorSessionTrackingPaused1777002576891';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add trackingPaused column
    await queryRunner.query(`ALTER TABLE "rent_sessions" ADD "trackingPaused" boolean NOT NULL DEFAULT false`);

    // Backfill: rows that were paused had tracking paused, session itself was active
    await queryRunner.query(`UPDATE "rent_sessions" SET "trackingPaused" = true WHERE "status" = 'paused'`);
    await queryRunner.query(`UPDATE "rent_sessions" SET "status" = 'active' WHERE "status" = 'paused'`);

    // Rebuild enum without 'paused'
    await queryRunner.query(`ALTER TYPE "public"."rent_sessions_status_enum" RENAME TO "rent_sessions_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."rent_sessions_status_enum" AS ENUM('active', 'ended')`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" TYPE "public"."rent_sessions_status_enum" USING "status"::"text"::"public"."rent_sessions_status_enum"`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" SET DEFAULT 'active'`);
    await queryRunner.query(`DROP TYPE "public"."rent_sessions_status_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore enum with 'paused'
    await queryRunner.query(`ALTER TYPE "public"."rent_sessions_status_enum" RENAME TO "rent_sessions_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."rent_sessions_status_enum" AS ENUM('active', 'paused', 'ended')`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" TYPE "public"."rent_sessions_status_enum" USING "status"::"text"::"public"."rent_sessions_status_enum"`);
    await queryRunner.query(`ALTER TABLE "rent_sessions" ALTER COLUMN "status" SET DEFAULT 'active'`);
    await queryRunner.query(`DROP TYPE "public"."rent_sessions_status_enum_old"`);

    await queryRunner.query(`ALTER TABLE "rent_sessions" DROP COLUMN "trackingPaused"`);
  }
}
