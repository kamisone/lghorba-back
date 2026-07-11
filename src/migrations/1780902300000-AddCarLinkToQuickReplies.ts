import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCarLinkToQuickReplies1780902300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quick_replies" ADD "carId" uuid`);
    await queryRunner.query(`
      ALTER TABLE "quick_replies"
      ADD CONSTRAINT "FK_quick_replies_car"
      FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_quick_replies_car" ON "quick_replies" ("carId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_quick_replies_car"`);
    await queryRunner.query(`ALTER TABLE "quick_replies" DROP CONSTRAINT "FK_quick_replies_car"`);
    await queryRunner.query(`ALTER TABLE "quick_replies" DROP COLUMN "carId"`);
  }
}
