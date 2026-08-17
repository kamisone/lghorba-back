import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ReplaySessionStatus = 'active' | 'ended' | 'error';

/**
 * Session-replay metadata for a test-product landing-page visit (rrweb
 * recording). Deliberately holds only lightweight, queryable fields — the
 * raw rrweb event stream is chunked into GCS objects (see
 * ReplaySessionChunk) and never touches this table. Same identity fields as
 * ShopBehaviorEvent (cartToken/visitorHash/clientIp/countryCode/device/
 * source) so a session can be cross-referenced with the ordinary behavior
 * timeline for the same visitor.
 *
 * No raw User-Agent column, matching this codebase's existing policy
 * (RecordInput.userAgent on ShopBehaviorEvent: "tested against the bot
 * pattern list, never persisted") — only the classified `device` survives.
 */
@Entity('shop_replay_sessions')
@Index(['productId', 'createdAt'])
@Index(['createdAt'])
export class ReplaySession {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) productId: string;

  @Column({ type: 'varchar', length: 100, nullable: true }) cartToken: string | null;

  /** Salted SHA-256 of the client IP — see GeoIpService, never the IP itself derived twice. */
  @Column({ type: 'varchar', length: 64, nullable: true }) visitorHash: string | null;

  /**
   * Raw address, kept for the same reason ShopBehaviorEvent.clientIp is:
   * lets an admin reviewing a session add an unwanted/bot source to the
   * existing analytics IP exclusion list straight from the replay UI.
   */
  @Column({ type: 'varchar', length: 45, nullable: true }) clientIp: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true }) countryCode: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true }) device: 'mobile' | 'desktop' | null;

  @Column({ type: 'varchar', length: 30, nullable: true }) source: string | null;

  @Column({ type: 'int', nullable: true }) viewportWidth: number | null;
  @Column({ type: 'int', nullable: true }) viewportHeight: number | null;

  /** Path only (query string stripped client-side) — see replay.util.ts sanitizePageUrl. */
  @Column({ type: 'varchar', length: 500, nullable: true }) pageUrl: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) pageTitle: string | null;

  /** Running totals, updated on every ingested batch — cheap for the admin list, no GCS read needed. */
  @Column({ type: 'int', default: 0 }) eventCount: number;
  @Column({ type: 'int', default: 0 }) chunkCount: number;
  @Column({ type: 'int', default: 0 }) clickCount: number;
  @Column({ type: 'int', default: 0 }) maxScrollPct: number;

  /**
   * 'active' until an explicit end (page unload via sendBeacon) or the
   * retention job reaps a session whose lastEventAt went stale (tab closed
   * without ever firing unload — mobile Safari, crashes, etc).
   */
  @Column({ type: 'varchar', length: 10, default: 'active' }) status: ReplaySessionStatus;

  @Column({ type: 'timestamptz' }) startedAt: Date;
  @Column({ type: 'timestamptz' }) lastEventAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) endedAt: Date | null;
  @Column({ type: 'int', nullable: true }) durationMs: number | null;

  /** Set the first time any admin opens this session's detail view — null means unread. */
  @Column({ type: 'timestamptz', nullable: true }) viewedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
}
