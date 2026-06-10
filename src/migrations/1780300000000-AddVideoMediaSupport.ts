import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds video support to the Media Library (duration on media_assets) and
 * introduces the generic `media` gallery column on shop_products (images +
 * videos, ordered, with an optional featured flag). Backfills `media` for
 * existing products from their current featuredImageKey/galleryImageKeys so
 * legacy image-only consumers keep working unchanged.
 */
export class AddVideoMediaSupport1780300000000 implements MigrationInterface {
  name = 'AddVideoMediaSupport1780300000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "media_assets"
        ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER NULL
    `);

    await runner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "media" JSONB NOT NULL DEFAULT '[]'
    `);

    // Backfill: featuredImageKey -> first item (isFeatured), galleryImageKeys -> rest, in order.
    await runner.query(`
      UPDATE "shop_products" AS p
      SET "media" = COALESCE((
        SELECT jsonb_agg(item ORDER BY ord)
        FROM (
          SELECT 0::bigint AS ord,
                 jsonb_build_object('key', p."featuredImageKey", 'type', 'image', 'isFeatured', true) AS item
          WHERE p."featuredImageKey" IS NOT NULL AND p."featuredImageKey" <> ''

          UNION ALL

          SELECT g.idx AS ord,
                 jsonb_build_object('key', g.key, 'type', 'image') AS item
          FROM unnest(p."galleryImageKeys") WITH ORDINALITY AS g(key, idx)
          WHERE g.key IS NOT NULL AND g.key <> ''
            AND g.key IS DISTINCT FROM p."featuredImageKey"
        ) AS combined
      ), '[]'::jsonb)
      WHERE COALESCE(p."media", '[]'::jsonb) = '[]'::jsonb
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "media"
    `);
    await runner.query(`
      ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "durationSeconds"
    `);
  }
}
