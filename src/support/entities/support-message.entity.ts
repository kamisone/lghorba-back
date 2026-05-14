import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum SenderType {
  GUEST  = 'guest',
  ADMIN  = 'admin',
  SYSTEM = 'system',
}

// Architecture-ready for future attachment support
export interface MessageAttachment {
  type:     'image' | 'document' | 'video';
  url:      string;
  filename: string;
  size:     number;    // bytes
  mimeType: string;
}

@Entity('support_messages')
@Index(['conversationId', 'createdAt'])
@Index(['conversationId', 'readAt'])   // seen queries
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'varchar' })
  senderType: SenderType;

  @Column({ nullable: true })
  senderId: string | null;

  @Column({ type: 'text' })
  content: string;

  // Null = unread; populated = seen by the OTHER party
  @Column({ type: 'timestamp with time zone', nullable: true })
  readAt: Date | null;

  // Future: attachment URLs/metadata
  @Column({ type: 'jsonb', nullable: true })
  attachments: MessageAttachment[] | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
