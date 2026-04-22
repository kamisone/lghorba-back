import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRentScheduleDto } from './dto/create-rent-schedule.dto';
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
      this.repo.create({ carId, fromDate: new Date(dto.fromDate), toDate: new Date(dto.toDate) }),
    );
  }

  async remove(id: string, carId: string): Promise<void> {
    const result = await this.repo.delete({ id, carId });
    if (result.affected === 0) throw new NotFoundException(`RentSchedule ${id} not found`);
  }
}
