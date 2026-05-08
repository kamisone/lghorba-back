import {
  Column, CreateDateColumn, Entity,
  Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type IngestionStatus =
  | 'pending'   // saved, not yet processed
  | 'parsed'    // extraction succeeded, car not yet matched
  | 'matched'   // car matched, booking not yet created
  | 'booked'    // booking created successfully
  | 'skipped'   // not a booking email (filtered out gracefully)
  | 'failed';   // processing error — needs manual review

export type SupportedProvider = 'turo' | 'getaround';

export interface ExtractedBooking {
  provider: SupportedProvider;
  reservationNumber: string;
  guestName: string;
  vehicleName: string;
  startDateTime: string; // ISO 8601
  endDateTime: string;   // ISO 8601
  totalEarning: number | null;
  pickupLocation: string | null;
  guestPhone: string | null;
  includedMileageKm: number | null;
  detectedLanguage: 'fr' | 'en';
}

@Entity('ingested_emails')
export class IngestedEmail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** RFC 2822 Message-ID header — used for deduplication. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 500 })
  messageId: string;

  /** IMAP UID (stringified) in the mailbox — informational. */
  @Column({ type: 'varchar', nullable: true })
  imapUid: string | null;

  @Column({ type: 'varchar', length: 500 })
  fromAddress: string;

  @Column({ type: 'varchar', length: 1000 })
  subject: string;

  @Column({ type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @Column({ type: 'text' })
  rawText: string;

  @Column({ type: 'text' })
  rawHtml: string;

  @Column({ type: 'varchar', nullable: true })
  provider: SupportedProvider | null;

  @Column({ type: 'jsonb', nullable: true })
  extractedBooking: ExtractedBooking | null;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: IngestionStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /** Set once a booking is created. */
  @Column({ type: 'uuid', nullable: true })
  bookingId: string | null;

  /** Provider reservation reference extracted from the email. */
  @Column({ type: 'varchar', nullable: true })
  reservationNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
