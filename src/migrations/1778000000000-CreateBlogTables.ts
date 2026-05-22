import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlogTables1778000000000 implements MigrationInterface {
  name = 'CreateBlogTables1778000000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "blog_categories" (
        "id"          UUID         DEFAULT gen_random_uuid() NOT NULL,
        "slug"        VARCHAR(300) NOT NULL,
        "name"        VARCHAR(300) NOT NULL,
        "color"       VARCHAR(7),
        "description" TEXT,
        "sortOrder"   INT          NOT NULL DEFAULT 0,
        "isActive"    BOOLEAN      NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blog_categories"   PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_categories_slug" UNIQUE ("slug")
      )
    `);

    await qr.query(`
      CREATE TABLE "blog_tags" (
        "id"        UUID         DEFAULT gen_random_uuid() NOT NULL,
        "slug"      VARCHAR(300) NOT NULL,
        "name"      VARCHAR(300) NOT NULL,
        "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blog_tags"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_tags_slug" UNIQUE ("slug")
      )
    `);

    await qr.query(`
      CREATE TABLE "blog_posts" (
        "id"                   UUID         DEFAULT gen_random_uuid() NOT NULL,
        "slug"                 VARCHAR(500) NOT NULL,
        "locale"               VARCHAR(10)  NOT NULL DEFAULT 'fr',
        "status"               VARCHAR(30)  NOT NULL DEFAULT 'draft',
        "title"                VARCHAR(500) NOT NULL,
        "excerpt"              TEXT,
        "content"              TEXT,
        "featuredImageKey"     VARCHAR(1000),
        "featuredImageAlt"     VARCHAR(300),
        "seoTitle"             VARCHAR(500),
        "seoDescription"       VARCHAR(500),
        "canonicalUrl"         VARCHAR(500),
        "readingTimeMinutes"   INT          NOT NULL DEFAULT 0,
        "publishedAt"          TIMESTAMPTZ,
        "scheduledPublishAt"   TIMESTAMPTZ,
        "featured"             BOOLEAN      NOT NULL DEFAULT false,
        "authorId"             UUID,
        "authorName"           VARCHAR(200),
        "createdAt"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blog_posts"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_posts_slug" UNIQUE ("slug")
      )
    `);

    await qr.query(`
      CREATE TABLE "blog_post_categories" (
        "postId"     UUID NOT NULL,
        "categoryId" UUID NOT NULL,
        CONSTRAINT "PK_blog_post_categories" PRIMARY KEY ("postId", "categoryId"),
        CONSTRAINT "FK_bpc_post"     FOREIGN KEY ("postId")     REFERENCES "blog_posts"("id")      ON DELETE CASCADE,
        CONSTRAINT "FK_bpc_category" FOREIGN KEY ("categoryId") REFERENCES "blog_categories"("id") ON DELETE CASCADE
      )
    `);

    await qr.query(`
      CREATE TABLE "blog_post_tags" (
        "postId" UUID NOT NULL,
        "tagId"  UUID NOT NULL,
        CONSTRAINT "PK_blog_post_tags" PRIMARY KEY ("postId", "tagId"),
        CONSTRAINT "FK_bpt_post" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bpt_tag"  FOREIGN KEY ("tagId")  REFERENCES "blog_tags"("id")  ON DELETE CASCADE
      )
    `);

    await qr.query(`CREATE INDEX "IDX_blog_posts_status"      ON "blog_posts" ("status")`);
    await qr.query(`CREATE INDEX "IDX_blog_posts_locale"      ON "blog_posts" ("locale")`);
    await qr.query(`CREATE INDEX "IDX_blog_posts_featured"    ON "blog_posts" ("featured")`);
    await qr.query(`CREATE INDEX "IDX_blog_posts_publishedAt" ON "blog_posts" ("publishedAt" DESC)`);
    await qr.query(`CREATE INDEX "IDX_blog_posts_scheduled"   ON "blog_posts" ("status", "scheduledPublishAt") WHERE "status" = 'scheduled'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "blog_post_tags"`);
    await qr.query(`DROP TABLE IF EXISTS "blog_post_categories"`);
    await qr.query(`DROP TABLE IF EXISTS "blog_posts"`);
    await qr.query(`DROP TABLE IF EXISTS "blog_tags"`);
    await qr.query(`DROP TABLE IF EXISTS "blog_categories"`);
  }
}
