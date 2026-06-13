import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewsletterSubscriberFields1780900400000 implements MigrationInterface {
  name = 'AddNewsletterSubscriberFields1780900400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."newsletter_subscriber_status" AS ENUM('subscribed', 'unsubscribed', 'bounced')
    `);
    await queryRunner.query(`
      ALTER TABLE "newsletter_subscribers"
        ADD COLUMN "status" "public"."newsletter_subscriber_status" NOT NULL DEFAULT 'subscribed',
        ADD COLUMN "source" varchar(50),
        ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "lastActivityAt" TIMESTAMP,
        ADD COLUMN "unsubscribedAt" TIMESTAMP,
        ADD COLUMN "unsubscribeToken" varchar(64)
    `);
    await queryRunner.query(`
      UPDATE "newsletter_subscribers"
      SET "unsubscribeToken" = md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text)
      WHERE "unsubscribeToken" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "newsletter_subscribers"
        ADD CONSTRAINT "UQ_newsletter_subscribers_unsubscribeToken" UNIQUE ("unsubscribeToken")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "newsletter_subscribers"
        DROP CONSTRAINT "UQ_newsletter_subscribers_unsubscribeToken",
        DROP COLUMN "unsubscribeToken",
        DROP COLUMN "unsubscribedAt",
        DROP COLUMN "lastActivityAt",
        DROP COLUMN "tags",
        DROP COLUMN "source",
        DROP COLUMN "status"
    `);
    await queryRunner.query(`DROP TYPE "public"."newsletter_subscriber_status"`);
  }
}
