import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { Car } from '../cars/car.entity';
import { CarPricing } from '../cars/car-pricing.entity';
import { DistributedLockService } from '../common/lock/distributed-lock.service';
import { isTransientDbError, withRetry } from '../common/utils/retry.util';
import { UsersService } from '../users/users.service';
import { VehicleAvailabilityService } from '../vehicle-availability/vehicle-availability.service';
import { Booking, BookingSource, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateBookingAdminDto } from './dto/create-booking-admin.dto';
import { CreateCarPricingDto, UpdateCarPricingDto } from './dto/create-car-pricing.dto';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface PriceBreakdownItem {
  startDate: string;
  endDate: string;
  pricePerDay: number;
  days: number;
  subtotal: number;
  label: string | null;
}

export interface PriceResult {
  totalPrice: number;
  numberOfDays: number;
  breakdown: PriceBreakdownItem[];
  basePricePerDay: number | null;
  basePricePerWeekendDay: number | null;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    @InjectRepository(CarPricing)
    private readonly pricingRepo: Repository<CarPricing>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly lockService: DistributedLockService,
    private readonly usersService: UsersService,
    private readonly availabilityService: VehicleAvailabilityService,
  ) {}

  // ── Date helpers ──────────────────────────────────────────────────────────

  private addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  private daysDiff(a: string, b: string): number {
    return Math.round(
      (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
    );
  }

  private isoToDate(iso: string): string {
    return new Date(iso).toISOString().slice(0, 10);
  }

  private validateDateRange(startDateTime: string, endDateTime: string): void {
    if (new Date(endDateTime) <= new Date(startDateTime)) {
      throw new BadRequestException('startDateTime must be before endDateTime');
    }
    if (new Date(startDateTime) <= new Date()) {
      throw new BadRequestException('startDateTime cannot be in the past');
    }
  }

  // ── Pricing (uses injected repos — safe for read-only calls) ──────────────

  async computePrice(
    carId: string, startDateTime: string, endDateTime: string,
  ): Promise<PriceResult> {
    return this.computePriceWithRepos(
      this.carRepo, this.pricingRepo,
      carId, startDateTime, endDateTime,
    );
  }

  private async computePriceWithRepos(
    carRepo:     Repository<Car> | EntityManager,
    pricingRepo: Repository<CarPricing> | EntityManager,
    carId: string, startDateTime: string, endDateTime: string,
  ): Promise<PriceResult> {
    const carR     = 'findOne' in carRepo     ? carRepo     as Repository<Car>        : (carRepo     as EntityManager).getRepository(Car);
    const pricingR = 'findOne' in pricingRepo ? pricingRepo as Repository<CarPricing> : (pricingRepo as EntityManager).getRepository(CarPricing);

    const car = await carR.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);

    const start = new Date(startDateTime);
    const end   = new Date(endDateTime);
    const numberOfDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));

    const startDate          = this.isoToDate(startDateTime);
    const endDateForPricing  = this.addDays(startDate, numberOfDays);

    const pricings = await pricingR
      .createQueryBuilder('p')
      .where('p.carId = :carId', { carId })
      .andWhere('p.startDate <= :endDate',   { endDate:   this.addDays(endDateForPricing, -1) })
      .andWhere('p.endDate   >= :startDate', { startDate })
      .getMany();

    const base        = car.basePricePerDay        !== null ? Number(car.basePricePerDay)        : 0;
    const weekendBase = car.basePricePerWeekendDay !== null ? Number(car.basePricePerWeekendDay) : null;
    const breakdown   = this.buildBreakdown(startDate, endDateForPricing, base, weekendBase, pricings);
    const totalPrice  = Math.round(breakdown.reduce((s, b) => s + b.subtotal, 0) * 100) / 100;

    return {
      totalPrice, numberOfDays, breakdown,
      basePricePerDay:        car.basePricePerDay        !== null ? base        : null,
      basePricePerWeekendDay: car.basePricePerWeekendDay !== null ? weekendBase : null,
    };
  }

  private isWeekend(dateStr: string): boolean {
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    return dow === 0 || dow === 6;
  }

  private effectiveRate(
    dateStr: string, rule: CarPricing | null,
    basePricePerDay: number, basePricePerWeekendDay: number | null,
  ): { ppd: number; label: string | null } {
    if (rule) return { ppd: Number(rule.pricePerDay), label: rule.label ?? null };
    if (basePricePerWeekendDay !== null && this.isWeekend(dateStr)) {
      return { ppd: basePricePerWeekendDay, label: 'Weekend' };
    }
    return { ppd: basePricePerDay, label: null };
  }

  private buildBreakdown(
    startDate: string, endDate: string,
    basePricePerDay: number, basePricePerWeekendDay: number | null,
    pricings: CarPricing[],
  ): PriceBreakdownItem[] {
    const items: PriceBreakdownItem[] = [];
    let cursor = startDate;

    while (cursor < endDate) {
      const rule = pricings.find(p => p.startDate <= cursor && p.endDate >= cursor) ?? null;
      const { ppd, label } = this.effectiveRate(cursor, rule, basePricePerDay, basePricePerWeekendDay);
      let segEnd = this.addDays(cursor, 1);

      while (segEnd < endDate) {
        const nextRule = pricings.find(p => p.startDate <= segEnd && p.endDate >= segEnd) ?? null;
        if ((nextRule?.id ?? null) !== (rule?.id ?? null)) break;
        const { ppd: nextPpd } = this.effectiveRate(segEnd, nextRule, basePricePerDay, basePricePerWeekendDay);
        if (nextPpd !== ppd) break;
        segEnd = this.addDays(segEnd, 1);
      }

      const days = this.daysDiff(cursor, segEnd);
      items.push({
        startDate: cursor,
        endDate:   this.addDays(segEnd, -1),
        pricePerDay: ppd,
        days,
        subtotal: Math.round(ppd * days * 100) / 100,
        label,
      });
      cursor = segEnd;
    }
    return items;
  }

  // ── Availability (read-only, uses injected repo) ──────────────────────────

  async checkAvailability(
    carId: string, startDateTime: string, endDateTime: string,
  ): Promise<AvailabilityResult> {
    const car = await this.carRepo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);

    const [conflict, block] = await Promise.all([
      this.bookingRepo
        .createQueryBuilder('b')
        .where('b.carId = :carId',            { carId })
        .andWhere('b.status != :cancelled',   { cancelled: BookingStatus.CANCELLED })
        .andWhere('b.startDateTime < :end',   { end: endDateTime })
        .andWhere('b.endDateTime   > :start', { start: startDateTime })
        .getOne(),
      this.availabilityService.isBlocked(carId, startDateTime, endDateTime),
    ]);

    if (block)    return { available: false, reason: block.reason ? `Unavailable: ${block.reason}` : 'Vehicle unavailable for this period' };
    if (conflict) return { available: false, reason: 'A booking already overlaps with these dates' };
    return { available: true };
  }

  // ── Create booking (public) — full concurrency protection ─────────────────
  //
  //  Layer 1 — Redis distributed lock  (per-car, reduces DB contention)
  //  Layer 2 — PostgreSQL SERIALIZABLE transaction (detects phantom reads)
  //  Layer 3 — Retry on serialization failure (SQLSTATE 40001 / 40P01)
  //  Layer 4 — DB exclusion constraint (absolute safety net, never bypassed)
  //
  //  Creates with status=pending_payment; PaymentsController attaches the
  //  PaymentIntent and the webhook transitions it to confirmed/cancelled.
  //
  async createPendingPaymentBooking(dto: CreateBookingDto): Promise<Booking> {
    this.validateDateRange(dto.startDateTime, dto.endDateTime);

    const user = await this.usersService.findOrCreate(
      dto.customerName,
      dto.customerPhone,
      { email: dto.customerEmail ?? undefined },
    );

    const lockKey = `booking:${dto.carId}`;

    return this.lockService.withLock(
      lockKey,
      30_000,
      () =>
        withRetry(
          () => this.dataSource.transaction('SERIALIZABLE', manager =>
            this.createPendingPaymentBookingInTx(manager, dto, user.id),
          ),
          { maxAttempts: 3, isRetryable: isTransientDbError },
        ),
    );
  }

  private async createPendingPaymentBookingInTx(
    manager: EntityManager,
    dto: CreateBookingDto,
    userId: string,
  ): Promise<Booking> {
    const carRepo     = manager.getRepository(Car);
    const bookingRepo = manager.getRepository(Booking);

    const car = await carRepo.findOne({ where: { id: dto.carId } });
    if (!car) throw new NotFoundException(`Car ${dto.carId} not found`);

    const conflict = await bookingRepo
      .createQueryBuilder('b')
      .where('b.carId = :carId',            { carId: dto.carId })
      .andWhere('b.status != :cancelled',   { cancelled: BookingStatus.CANCELLED })
      .andWhere('b.startDateTime < :end',   { end: dto.endDateTime })
      .andWhere('b.endDateTime   > :start', { start: dto.startDateTime })
      .setLock('pessimistic_read')
      .getOne();

    if (conflict) throw new ConflictException('Car is not available for the requested period');

    const block = await this.availabilityService.isBlocked(dto.carId, dto.startDateTime, dto.endDateTime);
    if (block) throw new ConflictException('Car is not available for the requested period');

    const priceResult = await this.computePriceWithRepos(
      manager.getRepository(Car),
      manager.getRepository(CarPricing),
      dto.carId, dto.startDateTime, dto.endDateTime,
    );

    try {
      const booking = bookingRepo.create({
        carId:         dto.carId,
        startDateTime: new Date(dto.startDateTime),
        endDateTime:   new Date(dto.endDateTime),
        totalPrice:    priceResult.totalPrice,
        status:        BookingStatus.PENDING_PAYMENT,
        source:        'private' as BookingSource,
        userId,
      });
      return await bookingRepo.save(booking);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23P01') {
        this.logger.warn(`Exclusion constraint caught overlap for car ${dto.carId}`);
        throw new ConflictException('Car is not available for the requested period');
      }
      throw err;
    }
  }

  async setPaymentIntentId(bookingId: string, paymentIntentId: string): Promise<void> {
    await this.bookingRepo.update(bookingId, { paymentIntentId });
  }

  async confirmByPaymentIntent(paymentIntentId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { paymentIntentId } });
    if (!booking) {
      this.logger.warn(`confirmByPaymentIntent: no booking for PI ${paymentIntentId}`);
      return;
    }
    if (booking.status === BookingStatus.CONFIRMED) return; // idempotent
    await this.bookingRepo.update(booking.id, { status: BookingStatus.CONFIRMED });
  }

  async cancelByPaymentIntent(paymentIntentId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { paymentIntentId } });
    if (!booking) return;
    if (booking.status === BookingStatus.CANCELLED) return; // idempotent
    await this.bookingRepo.update(booking.id, { status: BookingStatus.CANCELLED });
  }

  // ── TTL cleanup: expire stale pending_payment bookings ────────────────────
  // Runs every 5 minutes. Bookings that have been in pending_payment for
  // more than 30 minutes without a confirmed webhook are cancelled.

  @Cron('*/5 * * * *')
  async expireStalePendingPayments(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const stale  = await this.bookingRepo.find({
      where: { status: BookingStatus.PENDING_PAYMENT, createdAt: LessThan(cutoff) },
    });
    for (const booking of stale) {
      this.logger.log(`Expiring stale pending_payment booking ${booking.id}`);
      await this.bookingRepo.update(booking.id, { status: BookingStatus.CANCELLED });
    }
  }

  // ── Create booking (admin) — same concurrency stack ───────────────────────

  async createBookingAdmin(dto: CreateBookingAdminDto): Promise<Booking> {
    if (new Date(dto.endDateTime) <= new Date(dto.startDateTime)) {
      throw new BadRequestException('startDateTime must be before endDateTime');
    }

    const userId = await this.resolveUser(dto);

    const lockKey = `booking:${dto.carId}`;
    return this.lockService.withLock(
      lockKey,
      30_000,
      () =>
        withRetry(
          () => this.dataSource.transaction('SERIALIZABLE', manager =>
            this.createBookingAdminInTx(manager, dto, userId),
          ),
          { maxAttempts: 3, isRetryable: isTransientDbError },
        ),
    );
  }

  private async createBookingAdminInTx(
    manager: EntityManager,
    dto: CreateBookingAdminDto,
    userId: string | null,
  ): Promise<Booking> {
    const carRepo     = manager.getRepository(Car);
    const bookingRepo = manager.getRepository(Booking);

    const car = await carRepo.findOne({ where: { id: dto.carId } });
    if (!car) throw new NotFoundException(`Car ${dto.carId} not found`);

    const conflict = await bookingRepo
      .createQueryBuilder('b')
      .where('b.carId = :carId',            { carId: dto.carId })
      .andWhere('b.status != :cancelled',   { cancelled: BookingStatus.CANCELLED })
      .andWhere('b.startDateTime < :end',   { end: dto.endDateTime })
      .andWhere('b.endDateTime   > :start', { start: dto.startDateTime })
      .setLock('pessimistic_read')
      .getOne();

    if (conflict) throw new ConflictException('Car is not available for the requested period');

    const block = await this.availabilityService.isBlocked(dto.carId, dto.startDateTime, dto.endDateTime);
    if (block) throw new ConflictException('Car is not available for the requested period');

    try {
      const booking = bookingRepo.create({
        carId:             dto.carId,
        startDateTime:     new Date(dto.startDateTime),
        endDateTime:       new Date(dto.endDateTime),
        totalPrice:        0,
        status:            (dto.status ?? 'confirmed') as BookingStatus,
        source:            dto.source as BookingSource,
        userId,
        reservationNumber: dto.reservationNumber ?? null,
        totalEarning:      dto.totalEarning != null ? Number(dto.totalEarning) : null,
        color:             dto.color ?? null,
        autoStartTracking: dto.autoStartTracking ?? false,
        gpsStopMode:       dto.gpsStopMode       ?? 'auto',
      });
      return await bookingRepo.save(booking);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23P01') {
        this.logger.warn(`Exclusion constraint caught overlap for car ${dto.carId}`);
        throw new ConflictException('Car is not available for the requested period');
      }
      throw err;
    }
  }

  // ── Resolve user from guest info (migrated from RentSchedulesService) ─────

  private async resolveUser(dto: {
    userId?: string | null;
    guestName?: string | null;
    guestNumber?: string | null;
    guestEmail?: string | null;
    turoJoinDate?: string | null;
    getaroundJoinDate?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
  }): Promise<string | null> {
    if (dto.userId) {
      await this.usersService.patchPlatformDates(dto.userId, dto.turoJoinDate, dto.getaroundJoinDate, dto.guestEmail);
      return dto.userId;
    }
    if (dto.guestName && dto.guestNumber) {
      const user = await this.usersService.findOrCreate(
        dto.guestName,
        dto.guestNumber,
        { email: dto.guestEmail, turoJoinDate: dto.turoJoinDate, getaroundJoinDate: dto.getaroundJoinDate },
      );
      return user.id;
    }
    if (dto.customerName && dto.customerPhone) {
      const user = await this.usersService.findOrCreate(
        dto.customerName,
        dto.customerPhone,
        { email: dto.customerEmail ?? undefined },
      );
      return user.id;
    }
    return null;
  }

  // ── Update booking (admin) ────────────────────────────────────────────────

  async updateBookingAdmin(id: string, dto: Partial<CreateBookingAdminDto>): Promise<Booking> {
    const booking = await this.findBooking(id);

    if (dto.startDateTime || dto.endDateTime) {
      const start = dto.startDateTime ? new Date(dto.startDateTime) : booking.startDateTime;
      const end   = dto.endDateTime   ? new Date(dto.endDateTime)   : booking.endDateTime;
      if (end <= start) throw new BadRequestException('startDateTime must be before endDateTime');

      const conflict = await this.bookingRepo
        .createQueryBuilder('b')
        .where('b.carId = :carId',            { carId: booking.carId })
        .andWhere('b.id != :id',              { id })
        .andWhere('b.status != :cancelled',   { cancelled: BookingStatus.CANCELLED })
        .andWhere('b.startDateTime < :end',   { end })
        .andWhere('b.endDateTime   > :start', { start })
        .getOne();
      if (conflict) throw new ConflictException('Car is not available for the requested period');
    }

    const userId = dto.userId !== undefined || dto.guestName !== undefined || dto.customerName !== undefined || dto.customerPhone !== undefined
      ? await this.resolveUser(dto)
      : undefined;

    const update: Partial<Booking> = {};
    if (dto.startDateTime)      update.startDateTime     = new Date(dto.startDateTime);
    if (dto.endDateTime)        update.endDateTime       = new Date(dto.endDateTime);
    if (dto.source)             update.source            = dto.source as BookingSource;
    if (dto.status)             update.status            = dto.status as BookingStatus;
    if (userId !== undefined)   update.userId            = userId;
    if (dto.reservationNumber !== undefined) update.reservationNumber = dto.reservationNumber ?? null;
    if (dto.totalEarning      !== undefined) update.totalEarning      = dto.totalEarning != null ? Number(dto.totalEarning) : null;
    if (dto.color             !== undefined) update.color             = dto.color             ?? null;
    if (dto.autoStartTracking !== undefined) update.autoStartTracking = dto.autoStartTracking;
    if (dto.gpsStopMode       !== undefined) update.gpsStopMode       = dto.gpsStopMode;

    await this.bookingRepo.update(id, update);
    return this.findBooking(id);
  }

  // ── Calendar query — bookings visible on the admin calendar ──────────────

  async findCalendarBookings(carId: string): Promise<(Booking & { hasSession: boolean })[]> {
    // Returns non-cancelled bookings that don't have an active session.
    // hasSession indicates whether any session (active or ended) exists — used
    // to lock the autoStartTracking toggle on the frontend.
    const { entities, raw } = await this.bookingRepo
      .createQueryBuilder('b')
      .leftJoin('b.car', 'car')
      .leftJoinAndSelect('b.user', 'user')
      .leftJoin(
        'rent_sessions',
        'rs',
        'rs."bookingId" = b.id AND rs.status = \'active\'',
      )
      .addSelect(
        `EXISTS (SELECT 1 FROM rent_sessions rs2 WHERE rs2."bookingId" = b.id)`,
        'b_hasSession',
      )
      .where('b.carId = :carId', { carId })
      .andWhere('b.status != :cancelled', { cancelled: BookingStatus.CANCELLED })
      .andWhere('rs.id IS NULL')
      .orderBy('b.startDateTime', 'ASC')
      .getRawAndEntities();

    return entities.map((e, i) =>
      Object.assign(e, { hasSession: raw[i]?.b_hasSession === true || raw[i]?.b_hasSession === 't' }),
    );
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async findBooking(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id }, relations: ['car', 'user'] });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  async findBookingByPaymentIntentId(paymentIntentId: string): Promise<Booking | null> {
    return this.bookingRepo.findOne({ where: { paymentIntentId } });
  }

  async findAllBookings(filters?: {
    status?: BookingStatus;
    startDate?: string;
    endDate?: string;
    carId?: string;
    source?: BookingSource;
  }): Promise<(Booking & { hasSession: boolean })[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.car', 'car')
      .leftJoinAndSelect('b.user', 'user')
      .addSelect(
        `EXISTS (SELECT 1 FROM rent_sessions rs WHERE rs."bookingId" = b.id)`,
        'b_hasSession',
      )
      .orderBy('b.createdAt', 'DESC');

    if (filters?.status)    qb.andWhere('b.status = :status',        { status: filters.status });
    if (filters?.source)    qb.andWhere('b.source = :source',        { source: filters.source });
    if (filters?.carId)     qb.andWhere('b.carId  = :carId',         { carId: filters.carId });
    if (filters?.startDate) qb.andWhere('b.endDateTime   >= :from',  { from: new Date(`${filters.startDate}T00:00:00Z`) });
    if (filters?.endDate)   qb.andWhere('b.startDateTime <= :to',    { to:   new Date(`${filters.endDate}T23:59:59Z`) });

    const { entities, raw } = await qb.getRawAndEntities();
    return entities.map((e, i) =>
      Object.assign(e, { hasSession: raw[i]?.b_hasSession === true || raw[i]?.b_hasSession === 't' }),
    );
  }

  // ── Status update — optimistic lock prevents concurrent overwrite ─────────

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
    return withRetry(async () => {
      const booking = await this.findBooking(id);
      return this.bookingRepo.save({ ...booking, status });
    }, {
      maxAttempts: 3,
      isRetryable: (err) =>
        (err as { name?: string })?.name === 'OptimisticLockVersionMismatchError' ||
        isTransientDbError(err),
    });
  }

  async deleteBooking(id: string): Promise<void> {
    await this.findBooking(id);
    await this.bookingRepo.delete(id);
  }

  // ── Car Pricings (admin) ──────────────────────────────────────────────────

  async listPricings(carId: string): Promise<CarPricing[]> {
    const car = await this.carRepo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);
    return this.pricingRepo.find({ where: { carId }, order: { startDate: 'ASC' } });
  }

  async createPricing(carId: string, dto: CreateCarPricingDto): Promise<CarPricing> {
    const car = await this.carRepo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);
    return this.pricingRepo.save(this.pricingRepo.create({ carId, ...dto }));
  }

  async updatePricing(carId: string, pricingId: string, dto: UpdateCarPricingDto): Promise<CarPricing> {
    const pricing = await this.pricingRepo.findOne({ where: { id: pricingId, carId } });
    if (!pricing) throw new NotFoundException(`Pricing ${pricingId} not found`);
    await this.pricingRepo.update(pricingId, dto);
    return this.pricingRepo.findOne({ where: { id: pricingId } });
  }

  async removePricing(carId: string, pricingId: string): Promise<void> {
    const pricing = await this.pricingRepo.findOne({ where: { id: pricingId, carId } });
    if (!pricing) throw new NotFoundException(`Pricing ${pricingId} not found`);
    await this.pricingRepo.delete(pricingId);
  }
}
