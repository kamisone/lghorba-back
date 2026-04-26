import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTransmissionFromCars1777301000000 implements MigrationInterface {
  name = 'DropTransmissionFromCars1777301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN IF EXISTS "transmission"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cars" ADD "transmission" varchar`);
  }
}
