import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from '../common/utils/numeric.transformer';
import { RentSession } from './rent-session.entity';

@Entity('rent_positions')
export class RentPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RentSession, (session) => session.positions, { onDelete: 'CASCADE' })
  session: RentSession;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: NumericTransformer })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, transformer: NumericTransformer })
  lng: number;

  @Column({ type: 'text', nullable: true })
  rawMessage: string | null;

  @Column({ type: 'timestamp with time zone' })
  recordedAt: Date;

  /** Failed the plausibility filter; excluded from reads unless explicitly requested. */
  @Column({ type: 'boolean', default: false })
  rejected: boolean;

  @Column({ type: 'text', nullable: true })
  rejectReason: string | null;

  /** Speed implied by the move from the previous accepted position. Kept for threshold tuning. */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: NumericTransformer,
  })
  impliedSpeedKmh: number | null;
}
