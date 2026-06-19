import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommerceNotificationLogs1780901700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "commerce_notification_logs" (
        "id"          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "event"       character varying(60)  NOT NULL,
        "channel"     character varying(10)  NOT NULL,
        "recipient"   character varying(300) NOT NULL,
        "status"      character varying(20)  NOT NULL DEFAULT 'sent',
        "orderId"     uuid,
        "orderNumber" character varying,
        "error"       text,
        "metadata"    jsonb,
        "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_commerce_notif_event_created" ON "commerce_notification_logs" ("event", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_commerce_notif_channel_created" ON "commerce_notification_logs" ("channel", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "commerce_notification_logs"`);
  }
}
