import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trust badges gain optional `subtitle`/`link` fields and the existing
 * `label` field is renamed to `title` (required) for consistency with the
 * new shape `{ id, icon, title, subtitle?, link?, sortOrder }`.
 *
 * Renames the `label` key to `title` inside each `shop_products.trustBadges`
 * jsonb array element, and renames the matching `trustBadge:{id}:label`
 * translation rows to `trustBadge:{id}:title`.
 */
export class RenameTrustBadgeLabelToTitle1780900800000 implements MigrationInterface {
  name = 'RenameTrustBadgeLabelToTitle1780900800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      UPDATE "shop_products"
      SET "trustBadges" = (
        SELECT COALESCE(jsonb_agg((elem - 'label') || jsonb_build_object('title', elem->'label')), '[]'::jsonb)
        FROM jsonb_array_elements("trustBadges") AS elem
      )
      WHERE jsonb_typeof("trustBadges") = 'array' AND "trustBadges" != '[]'::jsonb
    `);

    await runner.query(`
      UPDATE "translations"
      SET field = regexp_replace(field, '^trustBadge:(.+):label$', 'trustBadge:\\1:title')
      WHERE field ~ '^trustBadge:.+:label$'
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      UPDATE "translations"
      SET field = regexp_replace(field, '^trustBadge:(.+):title$', 'trustBadge:\\1:label')
      WHERE field ~ '^trustBadge:.+:title$'
    `);

    await runner.query(`
      UPDATE "shop_products"
      SET "trustBadges" = (
        SELECT COALESCE(jsonb_agg((elem - 'title' - 'subtitle' - 'link') || jsonb_build_object('label', elem->'title')), '[]'::jsonb)
        FROM jsonb_array_elements("trustBadges") AS elem
      )
      WHERE jsonb_typeof("trustBadges") = 'array' AND "trustBadges" != '[]'::jsonb
    `);
  }
}
