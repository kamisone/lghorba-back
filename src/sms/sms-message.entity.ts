import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sms_messages')
export class SmsMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  to: string;

  @Column('text')
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
