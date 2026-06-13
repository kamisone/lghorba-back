import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsletterCampaigns1780900500000 implements MigrationInterface {
  name = 'CreateNewsletterCampaigns1780900500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."newsletter_campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."newsletter_campaign_type" AS ENUM(
        'newsletter', 'promotion', 'new_arrivals', 'flash_sale', 'category',
        'abandoned_cart', 'product_launch', 'announcement'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "newsletter_campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" varchar(200) NOT NULL,
        "subject" varchar(250) NOT NULL,
        "previewText" varchar(250),
        "htmlContent" text NOT NULL DEFAULT '',
        "audience" jsonb NOT NULL DEFAULT '{"segment":"all"}'::jsonb,
        "status" "public"."newsletter_campaign_status" NOT NULL DEFAULT 'draft',
        "type" "public"."newsletter_campaign_type" NOT NULL DEFAULT 'newsletter',
        "tags" text[] NOT NULL DEFAULT '{}',
        "scheduledAt" TIMESTAMP,
        "sentAt" TIMESTAMP,
        "bullJobId" varchar(100),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_newsletter_campaigns" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "newsletter_campaigns"`);
    await queryRunner.query(`DROP TYPE "public"."newsletter_campaign_type"`);
    await queryRunner.query(`DROP TYPE "public"."newsletter_campaign_status"`);
  }
}
