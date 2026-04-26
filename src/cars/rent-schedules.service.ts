import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { CreateRentScheduleDto } from './dto/create-rent-schedule.dto';
import { UpdateRentScheduleDto } from './dto/update-rent-schedule.dto';
import { RentSchedule } from './rent-schedule.entity';

@Injectable()
export class RentSchedulesService {
  constructor(
    @InjectRepository(RentSchedule)
    private readonly repo: Repository<RentSchedule>,
    private readonly usersService: UsersService,
  ) {}

  findAllForCar(carId: string): Promise<RentSchedule[]> {
    return this.repo.find({ where: { carId }, relations: { user: true }, order: { fromDate: 'ASC' } });
  }

  private async checkOverlap(carId: string, fromDate: Date, toDate: Date, excludeId?: string): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('rs')
      .where('rs.carId = :carId', { carId })
      .andWhere('rs.fromDate < :toDate', { toDate })
      .andWhere('rs.toDate > :fromDate', { fromDate })
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM rent_sessions s
        WHERE s."scheduleId" = rs.id
        AND s.status = 'ended'
      )`);
    if (excludeId) {
      qb.andWhere('rs.id != :excludeId', { excludeId });
    }
    const overlap = await qb.getOne();
    if (overlap) throw new ConflictException('Schedule dates overlap with an existing rent period');
  }

  async create(carId: string, dto: CreateRentScheduleDto): Promise<RentSchedule> {
    const fromDate = new Date(dto.fromDate);
    const toDate = new Date(dto.toDate);
    await this.checkOverlap(carId, fromDate, toDate);
    const userId = await this.resolveUser(dto);
    const saved = await this.repo.save(
      this.repo.create({
        carId,
        fromDate,
        toDate,
        userId,
        reservationNumber: dto.reservationNumber ?? null,
        totalEarning: dto.totalEarning !== undefined && dto.totalEarning !== null ? Number(dto.totalEarning) : null,
        autoStartTracking: dto.autoStartTracking ?? false,
        color: dto.color ?? null,
      }),
    );
    return this.repo.findOne({ where: { id: saved.id }, relations: { user: true } });
  }

  async update(carId: string, scheduleId: string, dto: UpdateRentScheduleDto): Promise<RentSchedule> {
    const schedule = await this.repo.findOne({ where: { id: scheduleId, carId } });
    if (!schedule) throw new NotFoundException(`RentSchedule ${scheduleId} not found`);

    const newFromDate = dto.fromDate !== undefined ? new Date(dto.fromDate) : schedule.fromDate;
    const newToDate = dto.toDate !== undefined ? new Date(dto.toDate) : schedule.toDate;
    if (dto.fromDate !== undefined || dto.toDate !== undefined) {
      await this.checkOverlap(carId, newFromDate, newToDate, scheduleId);
    }
    schedule.fromDate = newFromDate;
    schedule.toDate = newToDate;
    if (dto.reservationNumber !== undefined) schedule.reservationNumber = dto.reservationNumber ?? null;
    if (dto.totalEarning !== undefined) schedule.totalEarning = dto.totalEarning !== null ? Number(dto.totalEarning) : null;
    if (dto.autoStartTracking !== undefined) schedule.autoStartTracking = dto.autoStartTracking;
    if (dto.color !== undefined) schedule.color = dto.color ?? null;

    const userRelatedKeys: (keyof UpdateRentScheduleDto)[] = ['userId', 'guestName', 'guestNumber', 'guestEmail', 'turoJoinDate', 'getaroundJoinDate'];
    if (userRelatedKeys.some((k) => k in dto)) {
      schedule.userId = await this.resolveUser({
        userId: dto.userId !== undefined ? dto.userId : schedule.userId,
        guestName: dto.guestName,
        guestNumber: dto.guestNumber,
        guestEmail: dto.guestEmail,
        turoJoinDate: dto.turoJoinDate,
        getaroundJoinDate: dto.getaroundJoinDate,
      });
    }

    await this.repo.save(schedule);
    return this.repo.findOne({ where: { id: scheduleId }, relations: { user: true } });
  }

  async remove(id: string, carId: string): Promise<void> {
    const result = await this.repo.delete({ id, carId });
    if (result.affected === 0) throw new NotFoundException(`RentSchedule ${id} not found`);
  }

  private async resolveUser(dto: {
    userId?: string | null;
    guestName?: string | null;
    guestNumber?: string | null;
    guestEmail?: string | null;
    turoJoinDate?: string | null;
    getaroundJoinDate?: string | null;
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
    return null;
  }
}
