import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateParkings1777990000000 implements MigrationInterface {
  name = 'CreateParkings1777990000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "parkings" (
        "id"                   UUID         DEFAULT gen_random_uuid() NOT NULL,
        "label"                VARCHAR(200) NOT NULL,
        "address"              TEXT         NOT NULL,
        "city"                 VARCHAR(100),
        "latitude"             DOUBLE PRECISION,
        "longitude"            DOUBLE PRECISION,
        "monthlyRentEur"       NUMERIC(10,2),
        "cautionEur"           NUMERIC(10,2),
        "paymentDueDay"        INT,
        "ownerName"            VARCHAR(200),
        "status"               VARCHAR(30)  NOT NULL DEFAULT 'active',
        "parkingType"          VARCHAR(50),
        "accessInstructions"   TEXT,
        "pedestrianCode"       VARCHAR(100),
        "gateCode"             VARCHAR(100),
        "dimensionNotes"       TEXT,
        "comments"             TEXT,
        "isActive"             BOOLEAN      NOT NULL DEFAULT true,
        "createdAt"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_parkings" PRIMARY KEY ("id")
      )
    `);

    await qr.query(`
      CREATE TABLE "parking_owner_phones" (
        "id"           UUID         DEFAULT gen_random_uuid() NOT NULL,
        "parkingId"    UUID         NOT NULL,
        "phoneNumber"  VARCHAR(50)  NOT NULL,
        "label"        VARCHAR(100),
        "sortOrder"    INT          NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_parking_owner_phones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_parking_owner_phones_parking"
          FOREIGN KEY ("parkingId") REFERENCES "parkings"("id") ON DELETE CASCADE
      )
    `);

    await qr.query(`
      CREATE TABLE "parking_documents" (
        "id"           UUID         DEFAULT gen_random_uuid() NOT NULL,
        "parkingId"    UUID         NOT NULL,
        "gcsKey"       VARCHAR(500) NOT NULL,
        "originalName" VARCHAR(200),
        "docType"      VARCHAR(30)  NOT NULL DEFAULT 'photo',
        "caption"      VARCHAR(300),
        "sortOrder"    INT          NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_parking_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_parking_documents_parking"
          FOREIGN KEY ("parkingId") REFERENCES "parkings"("id") ON DELETE CASCADE
      )
    `);

    await qr.query(`
      ALTER TABLE "cars"
        ADD COLUMN IF NOT EXISTS "parkingId" UUID,
        ADD CONSTRAINT "FK_cars_parking"
          FOREIGN KEY ("parkingId") REFERENCES "parkings"("id") ON DELETE SET NULL
    `);

    await qr.query(`CREATE INDEX "IDX_parkings_city"     ON "parkings" ("city")`);
    await qr.query(`CREATE INDEX "IDX_parkings_status"   ON "parkings" ("status")`);
    await qr.query(`CREATE INDEX "IDX_parkings_isActive" ON "parkings" ("isActive")`);
    await qr.query(`CREATE INDEX "IDX_cars_parkingId"    ON "cars" ("parkingId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "cars" DROP CONSTRAINT IF EXISTS "FK_cars_parking"`);
    await qr.query(`ALTER TABLE "cars" DROP COLUMN IF EXISTS "parkingId"`);
    await qr.query(`DROP TABLE IF EXISTS "parking_documents"`);
    await qr.query(`DROP TABLE IF EXISTS "parking_owner_phones"`);
    await qr.query(`DROP TABLE IF EXISTS "parkings"`);
  }
}
