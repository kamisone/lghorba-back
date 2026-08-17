import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a traffic-source/platform classification (Instagram, Facebook,
 * TikTok, Google, ...) to shop_behavior_events, derived at write time from an
 * explicit utm_source or the visitor's first-touch Referer (see
 * platform.util.ts). Powers the "Source" column in the analytics detail
 * modal.
 *
 * Nullable, no default: existing rows never captured a referrer/utm_source,
 * and only the event types with a natural client touchpoint at landing
 * (product_view, search, add_to_cart, update_cart_item) capture it — the
 * rest fall back to null, shown as "—" like the other partially-covered
 * columns (device, country).
 */
export class AddSourceToShopBehaviorEvents1786970000000 implements MigrationInterface {
  name = 'AddSourceToShopBehaviorEvents1786970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events"
        ADD COLUMN IF NOT EXISTS "source" varchar(30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_behavior_events" DROP COLUMN IF EXISTS "source"
    `);
  }
}
