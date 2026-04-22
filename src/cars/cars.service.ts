import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Car } from './car.entity';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { RentSchedule } from './rent-schedule.entity';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'cars');

type CarWithRentStatus = Car & { isCurrentlyRented: boolean };

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Car)
    private readonly repo: Repository<Car>,
    @InjectRepository(RentSchedule)
    private readonly scheduleRepo: Repository<RentSchedule>,
  ) {}

  async findAll(): Promise<CarWithRentStatus[]> {
    const cars = await this.repo.find();
    if (cars.length === 0) return [];
    const now = new Date();
    const active = await this.scheduleRepo.find({
      where: { fromDate: LessThanOrEqual(now), toDate: MoreThanOrEqual(now) },
      select: ['carId'],
    });
    const rentedIds = new Set(active.map((s) => s.carId));
    return cars.map((car) => Object.assign(car, { isCurrentlyRented: rentedIds.has(car.id) }));
  }

  async findOne(id: string): Promise<CarWithRentStatus> {
    const car = await this.repo.findOne({ where: { id } });
    if (!car) throw new NotFoundException(`Car ${id} not found`);
    const now = new Date();
    const count = await this.scheduleRepo.count({
      where: { carId: id, fromDate: LessThanOrEqual(now), toDate: MoreThanOrEqual(now) },
    });
    return Object.assign(car, { isCurrentlyRented: count > 0 });
  }

  create(dto: CreateCarDto): Promise<Car> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateCarDto): Promise<CarWithRentStatus> {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }

  async setPhoto(id: string, filename: string): Promise<CarWithRentStatus> {
    const car = await this.findOne(id);
    if (car.photo) this.deletePhotoFile(car.photo);
    await this.repo.update(id, { photo: filename });
    return this.findOne(id);
  }

  async removePhoto(id: string): Promise<CarWithRentStatus> {
    const car = await this.findOne(id);
    if (!car.photo) throw new NotFoundException(`Car ${id} has no photo`);
    this.deletePhotoFile(car.photo);
    await this.repo.update(id, { photo: null });
    return this.findOne(id);
  }

  private deletePhotoFile(filename: string): void {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
