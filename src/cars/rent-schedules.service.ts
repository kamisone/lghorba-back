import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRentScheduleDto } from './dto/create-rent-schedule.dto';
import { UpdateRentScheduleDto } from './dto/update-rent-schedule.dto';
import { RentSchedule } from './rent-schedule.entity';

@Injectable()
export class RentSchedulesService {
  constructor(
    @InjectRepository(RentSchedule)
    private readonly repo: Repository<RentSchedule>,
  ) {}

  findAllForCar(carId: string): Promise<RentSchedule[]> {
    return this.repo.find({ where: { carId }, order: { fromDate: 'ASC' } });
  }

  create(carId: string, dto: CreateRentScheduleDto): Promise<RentSchedule> {
    return this.repo.save(
      this.repo.create({
        carId,
        fromDate: new Date(dto.fromDate),
        toDate: new Date(dto.toDate),
        autoStartTracking: dto.autoStartTracking ?? false,
        color: dto.color ?? null,
      }),
    );
  }

  async update(carId: string, scheduleId: string, dto: UpdateRentScheduleDto): Promise<RentSchedule> {
    const schedule = await this.repo.findOne({ where: { id: scheduleId, carId } });
    if (!schedule) throw new NotFoundException(`RentSchedule ${scheduleId} not found`);

    if (dto.fromDate !== undefined) schedule.fromDate = new Date(dto.fromDate);
    if (dto.toDate !== undefined) schedule.toDate = new Date(dto.toDate);
    if (dto.guestName !== undefined) schedule.guestName = dto.guestName;
    if (dto.guestNumber !== undefined) schedule.guestNumber = dto.guestNumber;
    if (dto.reservationNumber !== undefined) schedule.reservationNumber = dto.reservationNumber;
    if (dto.totalEarning !== undefined) schedule.totalEarning = dto.totalEarning !== null ? Number(dto.totalEarning) : null;
    if (dto.autoStartTracking !== undefined) schedule.autoStartTracking = dto.autoStartTracking;
    if (dto.color !== undefined) schedule.color = dto.color ?? null;

    return this.repo.save(schedule);
  }

  async remove(id: string, carId: string): Promise<void> {
    const result = await this.repo.delete({ id, carId });
    if (result.affected === 0) throw new NotFoundException(`RentSchedule ${id} not found`);
  }
}
