import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('spam_logs')
export class SpamLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ip: string | null;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'varchar', length: 20 })
  decision: string;

  /** Comma-separated list of triggered rule names */
  @Column({ type: 'text', nullable: true })
  reasons: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
