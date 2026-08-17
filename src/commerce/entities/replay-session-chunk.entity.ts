import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Pointer to one batch of raw rrweb events for a session, stored as a GCS
 * object (see GcsService, replay-tracking.service.ts). Kept out of Postgres
 * entirely — a long session can be several MB of DOM/mutation data, and this
 * table only ever holds small rows (a key + counters), regardless of how
 * long the recording runs.
 */
@Entity('shop_replay_session_chunks')
@Index(['sessionId'])
export class ReplaySessionChunk {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) sessionId: string;

  /** Order within the session — chunks are concatenated in this order for playback. */
  @Column({ type: 'int' }) sequence: number;

  @Column({ type: 'varchar', length: 255 }) gcsObjectKey: string;

  @Column({ type: 'int' }) sizeBytes: number;
  @Column({ type: 'int' }) eventCount: number;

  @CreateDateColumn() createdAt: Date;
}
