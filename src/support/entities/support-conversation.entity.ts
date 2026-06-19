import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum ConversationStatus {
  OPEN           = 'open',
  WAITING_ADMIN  = 'waiting_admin',
  WAITING_GUEST  = 'waiting_guest',
  CLOSED         = 'closed',
  ARCHIVED       = 'archived',
}

@Entity('support_conversations')
@Index(['status', 'lastMessageAt'])
@Index(['unreadAdminCount', 'lastMessageAt'])
export class SupportConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  guestToken: string;

  @Column({ nullable: true })
  guestName: string | null;

  @Column({ nullable: true })
  pageUrl: string | null;

  @Column({ nullable: true })
  assignedAdminId: string | null;

  @Column({ type: 'varchar', default: ConversationStatus.WAITING_ADMIN })
  status: ConversationStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastMessageAt: Date | null;

  @Column({ default: 0 })
  unreadAdminCount: number;

  @Column({ default: 0 })
  unreadGuestCount: number;

  // SMS debounce
  @Column({ type: 'timestamp with time zone', nullable: true })
  lastNotifiedAt: Date | null;

  // Analytics: time from conversation open to first admin reply
  @Column({ type: 'timestamp with time zone', nullable: true })
  firstResponseAt: Date | null;

  // Analytics: when the conversation was closed/resolved
  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt: Date | null;

  // Archive support (soft-archive, not deleted)
  @Column({ type: 'timestamp with time zone', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
