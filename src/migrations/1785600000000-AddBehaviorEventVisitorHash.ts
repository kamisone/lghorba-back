import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-visitor identity for behaviour events, so analytics can count unique
 * visitors per product instead of raw page hits (a refresh must not add a view).
 *
 * Stores a salted SHA-256 of the client IP, never the IP itself: the address is
 * still not persisted anywhere, and the digest cannot be reversed without the
 * server-side salt. Same visitor + same product therefore collapses to one row
 * in the reports while remaining pseudonymous.
 *
 * Nullable: rows written before this column existed keep counting by
 * `cartToken`, and the analytics queries fall back to it (see the
 * COALESCE(visitorHash, cartToken, id) expressions).
 */
export class AddBehaviorEventVisitorHash1785600000000 implements MigrationInterface {
  name = 'AddBehaviorEventVisitorHash1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events"
        ADD COLUMN IF NOT EXISTS "visitorHash" varchar(64)
    `);
    // Reports group by product and event type, then count distinct visitors.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_behavior_events_visitor"
      ON "shop_behavior_events" ("productId", "eventType", "visitorHash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shop_behavior_events_visitor"`);
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events" DROP COLUMN IF EXISTS "visitorHash"
    `);
  }
}
