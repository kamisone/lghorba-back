import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleAvailability } from './vehicle-availability.entity';
import { CreateVehicleAvailabilityDto, UpdateVehicleAvailabilityDto } from './dto/vehicle-availability.dto';

@Injectable()
export class VehicleAvailabilityService {
  constructor(
    @InjectRepository(VehicleAvailability)
    private readonly repo: Repository<VehicleAvailability>,
  ) {}

  async findByCarAndRange(
    carId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<VehicleAvailability[]> {
    const qb = this.repo
      .createQueryBuilder('va')
      .where('va.carId = :carId', { carId })
      .orderBy('va.startDate', 'ASC');

    if (fromDate) qb.andWhere('va.endDate >= :fromDate', { fromDate });
    if (toDate)   qb.andWhere('va.startDate <= :toDate', { toDate });

    return qb.getMany();
  }

  /** Returns true if any availability block overlaps the given date range. */
  async hasOverlap(carId: string, startDate: string, endDate: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('va')
      .where('va.carId = :carId',           { carId })
      .andWhere('va.startDate <= :endDate',  { endDate })
      .andWhere('va.endDate   >= :startDate',{ startDate });

    if (excludeId) qb.andWhere('va.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  /** Returns a Set of carIds that have an active block on the given date (YYYY-MM-DD). Single query. */
  async getBlockedCarIds(date: string): Promise<Set<string>> {
    const rows = await this.repo
      .createQueryBuilder('va')
      .select('va.carId', 'carId')
      .where('va.startDate <= :date', { date })
      .andWhere('va.endDate   >= :date', { date })
      .distinct(true)
      .getRawMany<{ carId: string }>();
    return new Set(rows.map(r => r.carId));
  }

  /** All blocks (any car) ending on or after the given date (YYYY-MM-DD). Single query. */
  findEndingOnOrAfter(date: string): Promise<VehicleAvailability[]> {
    return this.repo
      .createQueryBuilder('va')
      .where('va.endDate >= :date', { date })
      .getMany();
  }

  /** Check if a datetime range overlaps any availability block (for booking/search). */
  async isBlocked(carId: string, startDateTime: string, endDateTime: string): Promise<VehicleAvailability | null> {
    const startDate = startDateTime.slice(0, 10);
    const endDate   = endDateTime.slice(0, 10);
    return this.repo
      .createQueryBuilder('va')
      .where('va.carId = :carId',            { carId })
      .andWhere('va.startDate <= :endDate',  { endDate })
      .andWhere('va.endDate   >= :startDate',{ startDate })
      .getOne();
  }

  async create(
    carId: string,
    dto: CreateVehicleAvailabilityDto,
    adminId?: string,
  ): Promise<VehicleAvailability> {
    const block = this.repo.create({
      carId,
      startDate:        dto.startDate,
      endDate:          dto.endDate,
      reason:           dto.reason ?? null,
      notes:            dto.notes  ?? null,
      createdByAdminId: adminId ?? null,
    });
    return this.repo.save(block);
  }

  async update(id: string, dto: UpdateVehicleAvailabilityDto): Promise<VehicleAvailability> {
    const block = await this.repo.findOne({ where: { id } });
    if (!block) throw new NotFoundException(`Availability block ${id} not found`);

    if (dto.startDate !== undefined) block.startDate = dto.startDate;
    if (dto.endDate   !== undefined) block.endDate   = dto.endDate;
    if (dto.reason    !== undefined) block.reason    = dto.reason ?? null;
    if (dto.notes     !== undefined) block.notes     = dto.notes  ?? null;

    if (block.startDate > block.endDate) {
      throw new BadRequestException('endDate must be ≥ startDate');
    }
    return this.repo.save(block);
  }

  async remove(id: string): Promise<void> {
    const block = await this.repo.findOne({ where: { id } });
    if (!block) throw new NotFoundException(`Availability block ${id} not found`);
    await this.repo.delete(id);
  }
}
