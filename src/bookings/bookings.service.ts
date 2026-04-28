import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Car } from '../cars/car.entity';
import { CarPricing } from '../cars/car-pricing.entity';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateCarPricingDto, UpdateCarPricingDto } from './dto/create-car-pricing.dto';

export interface PriceBreakdownItem {
  startDate: string;
  endDate: string; // inclusive display
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
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    @InjectRepository(CarPricing)
    private readonly pricingRepo: Repository<CarPricing>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  private daysDiff(a: string, b: string): number {
    const da = new Date(`${a}T00:00:00Z`);
    const db = new Date(`${b}T00:00:00Z`);
    return Math.round((db.getTime() - da.getTime()) / 86_400_000);
  }

  private validateDateRange(startDate: string, endDate: string): void {
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (startDate < today) {
      throw new BadRequestException('startDate cannot be in the past');
    }
  }

  // ── Pricing ──────────────────────────────────────────────────────────────────

  async computePrice(carId: string, startDate: string, endDate: string): Promise<PriceResult> {
    const car = await this.carRepo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);

    const pricings = await this.pricingRepo
      .createQueryBuilder('p')
      .where('p.carId = :carId', { carId })
      .andWhere('p.startDate <= :endDate', { endDate: this.addDays(endDate, -1) })
      .andWhere('p.endDate >= :startDate', { startDate })
      .getMany();

    const numberOfDays = this.daysDiff(startDate, endDate);
    const base = car.basePricePerDay !== null ? Number(car.basePricePerDay) : 0;
    const breakdown = this.buildBreakdown(startDate, endDate, base, pricings);
    const totalPrice = Math.round(breakdown.reduce((sum, b) => sum + b.subtotal, 0) * 100) / 100;

    return { totalPrice, numberOfDays, breakdown, basePricePerDay: car.basePricePerDay !== null ? base : null };
  }

  private buildBreakdown(
    startDate: string,
    endDate: string,
    basePricePerDay: number,
    pricings: CarPricing[],
  ): PriceBreakdownItem[] {
    const items: PriceBreakdownItem[] = [];
    let cursor = startDate;

    while (cursor < endDate) {
      const rule = pricings.find((p) => p.startDate <= cursor && p.endDate >= cursor) ?? null;

      // Advance until rule changes or end
      let segEnd = this.addDays(cursor, 1);
      while (segEnd < endDate) {
        const nextRule = pricings.find((p) => p.startDate <= segEnd && p.endDate >= segEnd) ?? null;
        if ((nextRule?.id ?? null) !== (rule?.id ?? null)) break;
        segEnd = this.addDays(segEnd, 1);
      }

      const days = this.daysDiff(cursor, segEnd);
      const pricePerDay = rule ? Number(rule.pricePerDay) : basePricePerDay;
      items.push({
        startDate: cursor,
        endDate: this.addDays(segEnd, -1),
        pricePerDay,
        days,
        subtotal: Math.round(pricePerDay * days * 100) / 100,
        label: rule?.label ?? null,
      });

      cursor = segEnd;
    }

    return items;
  }

  // ── Availability ─────────────────────────────────────────────────────────────

  async checkAvailability(carId: string, startDate: string, endDate: string): Promise<AvailabilityResult> {
    const car = await this.carRepo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);

    const conflict = await this.bookingRepo
      .createQueryBuilder('b')
      .where('b.carId = :carId', { carId })
      .andWhere('b.status != :cancelled', { cancelled: BookingStatus.CANCELLED })
      .andWhere('b.startDate < :endDate', { endDate })
      .andWhere('b.endDate > :startDate', { startDate })
      .getOne();

    if (conflict) {
      return { available: false, reason: 'A confirmed booking overlaps with these dates' };
    }
    return { available: true };
  }

  // ── Bookings ─────────────────────────────────────────────────────────────────

  async createBooking(dto: CreateBookingDto): Promise<Booking> {
    this.validateDateRange(dto.startDate, dto.endDate);

    const { available, reason } = await this.checkAvailability(dto.carId, dto.startDate, dto.endDate);
    if (!available) throw new BadRequestException(reason ?? 'Car is not available for these dates');

    const priceResult = await this.computePrice(dto.carId, dto.startDate, dto.endDate);

    const booking = this.bookingRepo.create({
      carId:         dto.carId,
      startDate:     dto.startDate,
      endDate:       dto.endDate,
      totalPrice:    priceResult.totalPrice,
      status:        BookingStatus.PENDING,
      customerName:  dto.customerName  ?? null,
      customerEmail: dto.customerEmail ?? null,
      customerPhone: dto.customerPhone ?? null,
    });

    return this.bookingRepo.save(booking);
  }

  async findBooking(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id }, relations: ['car'] });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  async findAllBookings(filters?: {
    status?: BookingStatus;
    startDate?: string;
    endDate?: string;
    carId?: string;
  }): Promise<Booking[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.car', 'car')
      .orderBy('b.createdAt', 'DESC');

    if (filters?.status)    qb.andWhere('b.status = :status', { status: filters.status });
    if (filters?.carId)     qb.andWhere('b.carId = :carId',   { carId: filters.carId });
    // Bookings that overlap with the requested date window
    if (filters?.startDate) qb.andWhere('b.endDate >= :from',   { from: filters.startDate });
    if (filters?.endDate)   qb.andWhere('b.startDate <= :to',   { to:   filters.endDate   });

    return qb.getMany();
  }

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
    const booking = await this.findBooking(id);
    await this.bookingRepo.update(id, { status });
    return { ...booking, status };
  }

  async deleteBooking(id: string): Promise<void> {
    await this.findBooking(id); // throws 404 if not found
    await this.bookingRepo.delete(id);
  }

  // ── Car Pricings (admin) ─────────────────────────────────────────────────────

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
