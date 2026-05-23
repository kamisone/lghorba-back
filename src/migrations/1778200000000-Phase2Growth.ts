import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2Growth1778200000000 implements MigrationInterface {
  name = 'Phase2Growth1778200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Price rules ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_price_rules" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"       VARCHAR(300) NOT NULL,
        "type"       VARCHAR(30)  NOT NULL,
        "value"      INTEGER      NOT NULL,
        "scope"      VARCHAR(20)  NOT NULL DEFAULT 'variant',
        "variantId"  UUID,
        "productId"  UUID,
        "minQty"     INTEGER      NOT NULL DEFAULT 0,
        "priority"   INTEGER      NOT NULL DEFAULT 0,
        "isActive"   BOOLEAN      NOT NULL DEFAULT true,
        "startsAt"   TIMESTAMPTZ,
        "expiresAt"  TIMESTAMPTZ,
        "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_shop_price_rules" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_spr_active_scope"
        ON "shop_price_rules" ("isActive", "scope")
    `);

    // ── Blog–product references ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "blog_product_references" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "postId"     UUID         NOT NULL,
        "productId"  UUID         NOT NULL,
        "label"      VARCHAR(300),
        "sortOrder"  INTEGER      NOT NULL DEFAULT 0,
        "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_blog_product_references" PRIMARY KEY ("id"),
        CONSTRAINT "uq_blog_product_ref" UNIQUE ("postId", "productId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bpr_post_id"
        ON "blog_product_references" ("postId")
    `);

    // ── Editorial copy on collections ─────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "shop_collections"
        ADD COLUMN IF NOT EXISTS "heroCopy"      TEXT,
        ADD COLUMN IF NOT EXISTS "bodyHtml"      TEXT,
        ADD COLUMN IF NOT EXISTS "metaKeywords"  VARCHAR(500)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_product_references"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_price_rules"`);
    await queryRunner.query(`
      ALTER TABLE "shop_collections"
        DROP COLUMN IF EXISTS "heroCopy",
        DROP COLUMN IF EXISTS "bodyHtml",
        DROP COLUMN IF EXISTS "metaKeywords"
    `);
  }
}
