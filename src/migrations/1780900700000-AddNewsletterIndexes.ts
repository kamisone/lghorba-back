import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewsletterIndexes1780900700000 implements MigrationInterface {
  name = 'AddNewsletterIndexes1780900700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_newsletter_subscribers_status" ON "newsletter_subscribers" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_newsletter_subscribers_locale" ON "newsletter_subscribers" ("locale")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_newsletter_campaign_recipients_campaign_status"
        ON "newsletter_campaign_recipients" ("campaignId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_newsletter_campaign_recipients_campaign_status"`);
    await queryRunner.query(`DROP INDEX "IDX_newsletter_subscribers_locale"`);
    await queryRunner.query(`DROP INDEX "IDX_newsletter_subscribers_status"`);
  }
}
