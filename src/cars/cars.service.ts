import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { GcsService } from '../gcs/gcs.service';
import { RentSession, RentSessionStatus } from '../rent-sessions/rent-session.entity';
import { Car } from './car.entity';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';

type CarWithRentStatus = Car & { isCurrentlyRented: boolean; isTrackingActive: boolean };

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Car)
    private readonly repo: Repository<Car>,
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    private readonly gcsService: GcsService,
  ) {}

  async findAllPublic(): Promise<{ id: string; name: string; description: string | null; hasPhoto: boolean; isAvailable: boolean }[]> {
    const cars = await this.findAll();
    return cars.map((car) => ({
      id: car.id,
      name: car.name,
      description: car.description,
      hasPhoto: car.photo !== null,
      isAvailable: !car.isCurrentlyRented,
    }));
  }

  async findAll(): Promise<CarWithRentStatus[]> {
    const cars = await this.repo.find();
    if (cars.length === 0) return [];
    const [activeSessions, trackingSessions] = await Promise.all([
      this.sessionRepo.find({
        where: { status: RentSessionStatus.ACTIVE },
        select: ['carId'],
      }),
      this.sessionRepo.find({
        where: { status: RentSessionStatus.ACTIVE, trackingPaused: false },
        select: ['carId'],
      }),
    ]);
    const rentedIds = new Set(activeSessions.map((s) => s.carId));
    const trackingIds = new Set(trackingSessions.map((s) => s.carId));
    return cars.map((car) =>
      Object.assign(car, {
        isCurrentlyRented: rentedIds.has(car.id),
        isTrackingActive: trackingIds.has(car.id),
      }),
    );
  }

  async findOne(id: string): Promise<CarWithRentStatus> {
    const car = await this.repo.findOne({ where: { id } });
    if (!car) throw new NotFoundException(`Car ${id} not found`);
    const [rentedCount, trackingCount] = await Promise.all([
      this.sessionRepo.count({ where: { carId: id, status: RentSessionStatus.ACTIVE } }),
      this.sessionRepo.count({ where: { carId: id, status: RentSessionStatus.ACTIVE, trackingPaused: false } }),
    ]);
    return Object.assign(car, { isCurrentlyRented: rentedCount > 0, isTrackingActive: trackingCount > 0 });
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
