import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCarPhotos1777301100000 implements MigrationInterface {
  name = 'CreateCarPhotos1777301100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "car_photos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "carId" uuid NOT NULL,
        "objectName" varchar NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_car_photos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_car_photos_carId" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "car_photos"`);
  }
}
