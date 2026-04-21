import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RentSession } from './rent-session.entity';

@Entity('rent_positions')
export class RentPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RentSession, (session) => session.positions, { onDelete: 'CASCADE' })
  session: RentSession;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lng: number;

  @Column({ type: 'text', nullable: true })
  rawMessage: string | null;

  @Column({ type: 'timestamp' })
  recordedAt: Date;
}
