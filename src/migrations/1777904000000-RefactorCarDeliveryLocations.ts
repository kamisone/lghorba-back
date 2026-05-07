import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorCarDeliveryLocations1777904000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // 1. Add deliveryEnabled boolean
    await qr.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false`);

    // 2. Migrate deliveryType: 'none' → disabled, 'whitelist' → 'location'
    await qr.query(`UPDATE cars SET "deliveryEnabled" = true  WHERE "deliveryType" IN ('radius', 'whitelist', 'location')`);
    await qr.query(`UPDATE cars SET "deliveryType"    = 'location' WHERE "deliveryType" = 'whitelist'`);
    await qr.query(`UPDATE cars SET "deliveryType"    = NULL        WHERE "deliveryType" = 'none'`);

    // 3. Create normalized delivery locations table
    await qr.query(`
      CREATE TABLE IF NOT EXISTS car_delivery_locations (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "carId"     UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
        label       VARCHAR(200) NOT NULL,
        address     VARCHAR(500) NOT NULL,
        lat         FLOAT NOT NULL,
        lng         FLOAT NOT NULL,
        "radiusKm"  FLOAT NOT NULL DEFAULT 0.5,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_cdl_car ON car_delivery_locations ("carId")`);

    // 4. Migrate existing deliveryAddresses JSON → normalized rows
    //    The column was stored as TEXT (simple-json); parse and insert.
    const rows: { id: string; deliveryAddresses: string | null }[] = await qr.query(
      `SELECT id, "deliveryAddresses" FROM cars WHERE "deliveryAddresses" IS NOT NULL AND "deliveryAddresses" != 'null'`
    );
    for (const row of rows) {
      let addresses: { label?: string; lat: number; lng: number }[] = [];
      try { addresses = JSON.parse(row.deliveryAddresses ?? '[]'); } catch { continue; }
      for (const addr of addresses.slice(0, 10)) {
        await qr.query(
          `INSERT INTO car_delivery_locations ("carId", label, address, lat, lng)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, addr.label ?? 'Delivery point', addr.label ?? 'Address', addr.lat, addr.lng],
        );
      }
    }

    // 5. Drop the old simple-json column
    await qr.query(`ALTER TABLE cars DROP COLUMN IF EXISTS "deliveryAddresses"`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS "deliveryAddresses" TEXT`);
    await qr.query(`DROP TABLE IF EXISTS car_delivery_locations`);
    await qr.query(`UPDATE cars SET "deliveryType" = 'none' WHERE "deliveryEnabled" = false`);
    await qr.query(`UPDATE cars SET "deliveryType" = 'whitelist' WHERE "deliveryType" = 'location'`);
    await qr.query(`ALTER TABLE cars DROP COLUMN IF EXISTS "deliveryEnabled"`);
  }
}
