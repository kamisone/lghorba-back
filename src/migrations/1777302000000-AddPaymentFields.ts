import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentFields1777302000000 implements MigrationInterface {
  name = 'AddPaymentFields1777302000000';
  transaction = false; // ALTER TYPE ADD VALUE must autocommit before subsequent DDL can use the value

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE ... ADD VALUE is non-transactional in PostgreSQL — safe to re-run with IF NOT EXISTS
    await queryRunner.query(`
      ALTER TYPE bookings_status_enum ADD VALUE IF NOT EXISTS 'pending_payment'
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD COLUMN IF NOT EXISTS "paymentIntentId" varchar NULL
    `);

    // Partial unique index: only one pending/confirmed booking per PaymentIntent
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookings_payment_intent_id"
        ON "bookings" ("paymentIntentId")
        WHERE "paymentIntentId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_payment_intent_id"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "paymentIntentId"`);
    // PostgreSQL does not support removing enum values — down is a no-op for the enum
  }
}
