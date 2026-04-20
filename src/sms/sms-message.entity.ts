import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum SmsType {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

@Entity('sms_messages')
export class SmsMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  to: string;

  @Column('text')
  message: string;

  @Column({ type: 'enum', enum: SmsType, default: SmsType.OUTBOUND })
  type: SmsType;

  @Column({ default: false })
  consumed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
