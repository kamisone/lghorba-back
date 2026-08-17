import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Session-replay recording (rrweb) for test-product landing pages — see
 * replay.constants.ts. Three tables, mirroring the split described in the
 * feature's design: lightweight relational metadata + markers here, the
 * heavy raw rrweb event JSON lives in GCS (see ReplaySessionChunk.gcsObjectKey)
 * so this migration never has to carry large blobs through Postgres.
 *
 * No FK constraints, consistent with the rest of this schema (e.g.
 * shop_behavior_events.productId) — productId/cartToken are plain uuid/text
 * columns, not enforced references.
 */
export class CreateShopReplaySessions1786980000000
  implements MigrationInterface
{
  name = 'CreateShopReplaySessions1786980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_replay_sessions" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId"     uuid NOT NULL,
        "cartToken"     varchar(100),
        "visitorHash"   varchar(64),
        "clientIp"      varchar(45),
        "countryCode"   varchar(2),
        "device"        varchar(10),
        "source"        varchar(30),
        "viewportWidth"  integer,
        "viewportHeight" integer,
        "pageUrl"       varchar(500),
        "pageTitle"     varchar(300),
        "eventCount"    integer NOT NULL DEFAULT 0,
        "chunkCount"    integer NOT NULL DEFAULT 0,
        "clickCount"    integer NOT NULL DEFAULT 0,
        "maxScrollPct"  integer NOT NULL DEFAULT 0,
        "status"        varchar(10) NOT NULL DEFAULT 'active',
        "startedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "lastEventAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "endedAt"       TIMESTAMPTZ,
        "durationMs"    integer,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_replay_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_replay_sessions_productId_createdAt"
        ON "shop_replay_sessions" ("productId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_replay_sessions_createdAt"
        ON "shop_replay_sessions" ("createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_replay_session_chunks" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sessionId"     uuid NOT NULL,
        "sequence"      integer NOT NULL,
        "gcsObjectKey"  varchar(255) NOT NULL,
        "sizeBytes"     integer NOT NULL,
        "eventCount"    integer NOT NULL,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_replay_session_chunks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shop_replay_session_chunks_session_seq" UNIQUE ("sessionId", "sequence")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_replay_session_chunks_sessionId"
        ON "shop_replay_session_chunks" ("sessionId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shop_replay_events" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sessionId"     uuid NOT NULL,
        "type"          varchar(20) NOT NULL,
        "timestampMs"   integer NOT NULL,
        "label"         varchar(255),
        "meta"          jsonb,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_replay_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shop_replay_events_sessionId_timestampMs"
        ON "shop_replay_events" ("sessionId", "timestampMs")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_replay_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_replay_session_chunks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_replay_sessions"`);
  }
}
