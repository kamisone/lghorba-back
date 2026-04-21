import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Car } from './car.entity';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'cars');

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Car)
    private readonly repo: Repository<Car>,
  ) {}

  findAll(): Promise<Car[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<Car> {
    const car = await this.repo.findOne({ where: { id } });
    if (!car) throw new NotFoundException(`Car ${id} not found`);
    return car;
  }

  create(dto: CreateCarDto): Promise<Car> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateCarDto): Promise<Car> {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }

  async setPhoto(id: string, filename: string): Promise<Car> {
    const car = await this.findOne(id);
    if (car.photo) {
      this.deletePhotoFile(car.photo);
    }
    await this.repo.update(id, { photo: filename });
    return this.findOne(id);
  }

  async removePhoto(id: string): Promise<Car> {
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
