import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { GcsService } from '../gcs/gcs.service';
import { Car } from './car.entity';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { RentSchedule } from './rent-schedule.entity';

type CarWithRentStatus = Car & { isCurrentlyRented: boolean };

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Car)
    private readonly repo: Repository<Car>,
    @InjectRepository(RentSchedule)
    private readonly scheduleRepo: Repository<RentSchedule>,
    private readonly gcsService: GcsService,
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
    const car = await this.findOne(id);
    if (car.photo) await this.gcsService.delete(car.photo);
    await this.repo.delete(id);
  }

  async setPhoto(id: string, file: Express.Multer.File): Promise<CarWithRentStatus> {
    const car = await this.findOne(id);
    if (car.photo) await this.gcsService.delete(car.photo);
    const objectName = `cars/${uuidv4()}${extname(file.originalname)}`;
    await this.gcsService.upload(file.buffer, objectName, file.mimetype);
    await this.repo.update(id, { photo: objectName });
    return this.findOne(id);
  }

  getPhotoUrl(objectName: string): Promise<string> {
    return this.gcsService.signedUrl(objectName);
  }

  async removePhoto(id: string): Promise<CarWithRentStatus> {
    const car = await this.findOne(id);
    if (!car.photo) throw new NotFoundException(`Car ${id} has no photo`);
    await this.gcsService.delete(car.photo);
    await this.repo.update(id, { photo: null });
    return this.findOne(id);
  }
}
