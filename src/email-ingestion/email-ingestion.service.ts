import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { IngestedEmail, IngestionStatus } from './entities/ingested-email.entity';
import { Car } from '../cars/car.entity';
import { BookingsService } from '../bookings/bookings.service';
import { TuroEmailParser } from './parsers/turo-email-parser';
import { GetaroundEmailParser } from './parsers/getaround-email-parser';
import { ProviderEmailParser, RawEmail } from './parsers/provider-email-parser.interface';

export const EMAIL_INGESTION_QUEUE = 'email-ingestion';

export interface ProcessEmailJobData {
  ingestedEmailId: string;
}

export interface RawEmailInput extends RawEmail {
  messageId: string;
  imapUid?: string;
  receivedAt?: Date;
}

@Injectable()
export class EmailIngestionService {
  private readonly logger = new Logger(EmailIngestionService.name);
  private readonly parsers: ProviderEmailParser[];

  constructor(
    @InjectRepository(IngestedEmail)
    private readonly repo: Repository<IngestedEmail>,
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    @InjectQueue(EMAIL_INGESTION_QUEUE)
    private readonly queue: Queue,
    private readonly bookingsService: BookingsService,
    private readonly turoParser: TuroEmailParser,
    private readonly getaroundParser: GetaroundEmailParser,
  ) {
    this.parsers = [turoParser, getaroundParser];
  }

  // ── Ingestion entry point ──────────────────────────────────────────────────

  /** Saves the raw email and enqueues a processing job. Idempotent on messageId. */
  async ingestEmail(input: RawEmailInput): Promise<IngestedEmail | null> {
    const existing = await this.repo.findOne({ where: { messageId: input.messageId } });
    if (existing) {
      this.logger.debug(`Email ${input.messageId} already ingested (id=${existing.id})`);
      return null; // already processed
    }

    const record = this.repo.create({
      messageId:   input.messageId,
      imapUid:     input.imapUid ?? null,
      fromAddress: input.fromAddress,
      subject:     input.subject.slice(0, 1000),
      receivedAt:  input.receivedAt ?? null,
      rawText:     input.text,
      rawHtml:     input.html,
      status:      'pending',
    });

    const saved = await this.repo.save(record);
    this.logger.log(`Ingested email id=${saved.id} from=${input.fromAddress}`);

    await this.queue.add(
      'process-email',
      { ingestedEmailId: saved.id } satisfies ProcessEmailJobData,
      {
        jobId:    `email.${saved.id}`,
        attempts: 3,
        backoff:  { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail:     100,
      },
    );

    return saved;
  }

  // ── Core processing pipeline ───────────────────────────────────────────────

  async processEmail(id: string): Promise<void> {
    const email = await this.repo.findOne({ where: { id } });
    if (!email) throw new NotFoundException(`IngestedEmail ${id} not found`);

    // Skip emails that are already successfully processed
    if (email.status === 'booked' || email.status === 'skipped') {
      this.logger.debug(`Email ${id} already in terminal state (${email.status}), skipping`);
      return;
    }

    const raw: RawEmail = {
      fromAddress: email.fromAddress,
      subject:     email.subject,
      text:        email.rawText,
      html:        email.rawHtml,
    };

    // 1. Detect provider
    const parser = this.parsers.find(p => p.detect(raw));
    if (!parser) {
      await this.updateStatus(email, 'skipped', 'No matching provider parser');
      return;
    }

    // 2. Parse
    let extracted;
    try {
      extracted = parser.parse(raw);
    } catch (err) {
      await this.updateStatus(email, 'failed', `Parse error: ${(err as Error).message}`);
      throw err; // let BullMQ retry
    }

    await this.repo.update(id, {
      provider:         extracted.provider,
      extractedBooking: extracted,
      reservationNumber: extracted.reservationNumber,
      status:           'parsed',
    });

    // 3. Deduplication — check if reservation already exists
    const duplicate = await this.checkDuplicate(extracted.provider, extracted.reservationNumber);
    if (duplicate) {
      await this.updateStatus(email, 'skipped', `Duplicate reservation ${extracted.reservationNumber}`);
      this.logger.warn(`Duplicate reservation ${extracted.reservationNumber} from ${extracted.provider}`);
      return;
    }

    // 4. Match car
    const car = await this.matchCar(extracted.vehicleName);
    if (!car) {
      await this.updateStatus(
        email, 'failed',
        `No car matched for vehicle name "${extracted.vehicleName}"`,
      );
      return; // not transient — admin must review
    }

    await this.repo.update(id, { status: 'matched' });

    // 5. Create booking
    try {
      const booking = await this.bookingsService.createBookingAdmin({
        carId:                    car.id,
        startDateTime:            extracted.startDateTime,
        endDateTime:              extracted.endDateTime,
        source:                   extracted.provider,
        status:                   'confirmed',
        guestName:                extracted.guestName,
        guestNumber:              extracted.guestPhone ?? '+33999999999',
        reservationNumber:        extracted.reservationNumber,
        totalEarning:             extracted.totalEarning ?? undefined,
        guestPlatformProfileUrl:  extracted.platformProfileUrl ?? undefined,
        autoStartTracking:        false,
        gpsStopMode:              'auto',
      });

      await this.repo.update(id, { status: 'booked', bookingId: booking.id });
      this.logger.log(
        `Created booking ${booking.id} from email ${id} (${extracted.provider} #${extracted.reservationNumber})`,
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        // Booking overlap — not transient, needs review
        await this.updateStatus(email, 'failed', `Booking conflict: ${(err as Error).message}`);
        return;
      }
      // Transient error — let BullMQ retry
      await this.updateStatus(email, 'failed', `Booking creation failed: ${(err as Error).message}`);
      throw err;
    }
  }

  // ── Replay ────────────────────────────────────────────────────────────────

  async replayEmail(id: string): Promise<void> {
    const email = await this.repo.findOne({ where: { id } });
    if (!email) throw new NotFoundException(`IngestedEmail ${id} not found`);
    if (email.status === 'booked') throw new BadRequestException('Email already successfully booked');

    await this.repo.update(id, { status: 'pending', errorMessage: null });
    await this.queue.add(
      'process-email',
      { ingestedEmailId: id } satisfies ProcessEmailJobData,
      {
        jobId:    `email.replay.${id}.${Date.now()}`,
        attempts: 3,
        backoff:  { type: 'exponential', delay: 10_000 },
      },
    );
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  findAll(status?: IngestionStatus): Promise<IngestedEmail[]> {
    const qb = this.repo.createQueryBuilder('e').orderBy('e.createdAt', 'DESC').limit(200);
    if (status) qb.where('e.status = :status', { status });
    return qb.getMany();
  }

  findOne(id: string): Promise<IngestedEmail | null> {
    return this.repo.findOne({ where: { id } });
  }

  async stats(): Promise<Record<string, number>> {
    const rows: { status: string; count: string }[] = await this.repo
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.status')
      .getRawMany();

    return Object.fromEntries(rows.map(r => [r.status, parseInt(r.count, 10)]));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async updateStatus(
    email: IngestedEmail,
    status: IngestionStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.repo.update(email.id, {
      status,
      errorMessage: errorMessage ?? null,
    });
  }

  private async checkDuplicate(provider: string, reservationNumber: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { provider: provider as any, reservationNumber, status: 'booked' },
    });
    return count > 0;
  }

  /**
   * Tries to match a car by vehicle name extracted from the email.
   * Strategy:
   *   1. Exact match on car.name (case-insensitive)
   *   2. Match on "brand model" concatenation
   *   3. Any car whose name is contained in the extracted vehicle name
   */
  private async matchCar(vehicleName: string): Promise<Car | null> {
    const norm = vehicleName.toLowerCase().trim();

    const cars = await this.carRepo.find({ select: ['id', 'name', 'brand', 'model', 'modelYear'] });

    // Exact match on car.name
    let match = cars.find(c => c.name.toLowerCase() === norm);
    if (match) return match;

    // Match on brand + model (e.g. "Peugeot 208")
    match = cars.find(c => {
      const bm = `${c.brand ?? ''} ${c.model ?? ''}`.toLowerCase().trim();
      return bm && (norm === bm || norm.includes(bm) || bm.includes(norm));
    });
    if (match) return match;

    // Loose: car name contained in vehicle string or vice-versa
    match = cars.find(c => {
      const cn = c.name.toLowerCase();
      return norm.includes(cn) || cn.includes(norm);
    });
    return match ?? null;
  }
}
