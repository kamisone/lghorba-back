import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPricingAndBookings1777301300000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Add basePricePerDay to cars
    await queryRunner.query(`
      ALTER TABLE "cars"
        ADD COLUMN IF NOT EXISTS "basePricePerDay" DECIMAL(10,2) NULL
    `);

    // Create car_pricings table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "car_pricings" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "carId"        UUID         NOT NULL,
        "startDate"    DATE         NOT NULL,
        "endDate"      DATE         NOT NULL,
        "pricePerDay"  DECIMAL(10,2) NOT NULL,
        "label"        VARCHAR      NULL,
        "createdAt"    TIMESTAMP    NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_car_pricings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_car_pricings_car" FOREIGN KEY ("carId")
          REFERENCES "cars"("id") ON DELETE CASCADE
      )
    `);

    // Create bookings table
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bookings_status_enum" AS ENUM ('pending', 'confirmed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bookings" (
        "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
        "carId"         UUID          NOT NULL,
        "startDate"     DATE          NOT NULL,
        "endDate"       DATE          NOT NULL,
        "totalPrice"    DECIMAL(10,2) NOT NULL,
        "status"        "bookings_status_enum" NOT NULL DEFAULT 'pending',
        "customerName"  VARCHAR       NULL,
        "customerEmail" VARCHAR       NULL,
        "customerPhone" VARCHAR       NULL,
        "createdAt"     TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bookings_car" FOREIGN KEY ("carId")
          REFERENCES "cars"("id") ON DELETE CASCADE
      )
    `);

    // Index for availability queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookings_car_dates"
        ON "bookings" ("carId", "startDate", "endDate")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_car_dates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bookings_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "car_pricings"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN IF EXISTS "basePricePerDay"`);
  }
}
