import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsletterCampaignRecipients1780900600000 implements MigrationInterface {
  name = 'CreateNewsletterCampaignRecipients1780900600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."newsletter_recipient_status" AS ENUM('pending', 'sent', 'failed', 'skipped')
    `);
    await queryRunner.query(`
      CREATE TABLE "newsletter_campaign_recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaignId" uuid NOT NULL,
        "subscriberId" uuid,
        "email" varchar(300) NOT NULL,
        "status" "public"."newsletter_recipient_status" NOT NULL DEFAULT 'pending',
        "trackingToken" varchar(64) NOT NULL,
        "sentAt" TIMESTAMP,
        "openedAt" TIMESTAMP,
        "clickedAt" TIMESTAMP,
        "unsubscribedAt" TIMESTAMP,
        "error" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_newsletter_campaign_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_newsletter_campaign_recipients_tracking_token" UNIQUE ("trackingToken"),
        CONSTRAINT "UQ_newsletter_campaign_recipients_campaign_email" UNIQUE ("campaignId", "email"),
        CONSTRAINT "FK_newsletter_campaign_recipients_campaign" FOREIGN KEY ("campaignId")
          REFERENCES "newsletter_campaigns"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "newsletter_campaign_recipients"`);
    await queryRunner.query(`DROP TYPE "public"."newsletter_recipient_status"`);
  }
}
