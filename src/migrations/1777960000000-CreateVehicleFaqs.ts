import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehicleFaqs1777960000000 implements MigrationInterface {
  name = 'CreateVehicleFaqs1777960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vehicle_faqs" (
        "id"          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "entityType"  varchar(64)   NOT NULL,
        "entityId"    uuid          NOT NULL,
        "position"    integer       NOT NULL DEFAULT 0,
        "isVisible"   boolean       NOT NULL DEFAULT true,
        "question"    text          NOT NULL,
        "answer"      text          NOT NULL,
        "createdAt"   TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vehicle_faqs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_vehicle_faqs_entity"
        ON "vehicle_faqs" ("entityType", "entityId", "position")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_vehicle_faqs_entity"`);
    await queryRunner.query(`DROP TABLE "vehicle_faqs"`);
  }
}
