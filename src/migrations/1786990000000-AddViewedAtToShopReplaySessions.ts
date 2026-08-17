import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Read/unread tracking for the admin session-replay list — set the first
 * time any admin opens a session's detail view (see
 * ReplayAdminService.getSessionDetail). Nullable, no default: every
 * existing session is unread until opened.
 */
export class AddViewedAtToShopReplaySessions1786990000000
  implements MigrationInterface
{
  name = 'AddViewedAtToShopReplaySessions1786990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_replay_sessions"
        ADD COLUMN IF NOT EXISTS "viewedAt" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shop_replay_sessions" DROP COLUMN IF EXISTS "viewedAt"
    `);
  }
}
