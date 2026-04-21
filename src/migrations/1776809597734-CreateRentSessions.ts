import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRentSessions1776809597734 implements MigrationInterface {
    name = 'CreateRentSessions1776809597734'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."rent_sessions_status_enum" AS ENUM('active', 'ended')`);
        await queryRunner.query(`CREATE TABLE "rent_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "carId" uuid NOT NULL, "status" "public"."rent_sessions_status_enum" NOT NULL DEFAULT 'active', "startedAt" TIMESTAMP NOT NULL DEFAULT now(), "endedAt" TIMESTAMP, CONSTRAINT "PK_137c8de38db8dbe82eee232e24b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "rent_positions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sessionId" uuid NOT NULL, "lat" numeric(10,7) NOT NULL, "lng" numeric(10,7) NOT NULL, "rawMessage" text, "recordedAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_07a8041e6d230e04b5b744cfedb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" ADD CONSTRAINT "FK_512a507cb04ad90fa11b2d069da" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rent_positions" ADD CONSTRAINT "FK_0aedd7b56e1bcbd9a0352321cc4" FOREIGN KEY ("sessionId") REFERENCES "rent_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rent_positions" DROP CONSTRAINT "FK_0aedd7b56e1bcbd9a0352321cc4"`);
        await queryRunner.query(`ALTER TABLE "rent_sessions" DROP CONSTRAINT "FK_512a507cb04ad90fa11b2d069da"`);
        await queryRunner.query(`DROP TABLE "rent_positions"`);
        await queryRunner.query(`DROP TABLE "rent_sessions"`);
        await queryRunner.query(`DROP TYPE "public"."rent_sessions_status_enum"`);
    }

}
