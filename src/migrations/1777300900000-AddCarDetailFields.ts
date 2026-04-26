import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCarDetailFields1777300900000 implements MigrationInterface {
  name = 'AddCarDetailFields1777300900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cars" ADD "brand" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "model" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "finishing" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "modelYear" integer`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "vehicleType" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "energy" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "gearbox" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "transmission" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "din" integer`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "mileage" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "numberOfDoors" integer`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "numberOfSeats" integer`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "color" varchar`);
    await queryRunner.query(`ALTER TABLE "cars" ADD "vehicleCondition" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "vehicleCondition"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "color"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "numberOfSeats"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "numberOfDoors"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "mileage"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "din"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "transmission"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "gearbox"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "energy"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "vehicleType"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "modelYear"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "finishing"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "model"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN "brand"`);
  }
}
