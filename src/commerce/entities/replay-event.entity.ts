import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ReplayEventType =
  | 'session_start'
  | 'session_end'
  | 'click'
  | 'scroll'
  | 'navigation';

/**
 * Lightweight, queryable markers for a replay session's timeline/event list
 * — deliberately separate from the raw rrweb event stream (which lives in
 * GCS chunks). Powers the admin replay UI's timeline dots and event list
 * without ever reading a GCS blob: `timestampMs` is relative to the
 * session's recording start, matching rrweb-player's own `goto(ms)` API
 * directly, so clicking a row can seek the player with no conversion.
 */
@Entity('shop_replay_events')
@Index(['sessionId', 'timestampMs'])
export class ReplayEvent {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) sessionId: string;

  @Column({ type: 'varchar', length: 20 }) type: ReplayEventType;

  /** Milliseconds since session start — matches the rrweb recording's own relative clock. */
  @Column({ type: 'int' }) timestampMs: number;

  /** Short human label — click target text/selector, or the navigated-to path. */
  @Column({ type: 'varchar', length: 255, nullable: true }) label: string | null;

  /** e.g. { x, y, selector } for a click, { scrollPct } for scroll, { path } for navigation. */
  @Column({ type: 'jsonb', nullable: true }) meta: Record<string, unknown> | null;

  @CreateDateColumn() createdAt: Date;
}
