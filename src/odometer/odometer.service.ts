import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { OdometerReading, OdometerSource } from './entities/odometer-reading.entity';
import { FLEET_MAINTENANCE_QUEUE } from '../maintenance-jobs/maintenance-jobs.constants';

@Injectable()
export class OdometerService {
  constructor(
    @InjectRepository(OdometerReading)
    private readonly repo: Repository<OdometerReading>,
    @InjectQueue(FLEET_MAINTENANCE_QUEUE)
    private readonly queue: Queue,
  ) {}

  async findByCarId(carId: string): Promise<OdometerReading[]> {
    return this.repo.find({
      where: { carId },
      order: { recordedAt: 'DESC' },
    });
  }

  async findLatest(carId: string): Promise<OdometerReading | null> {
    return this.repo.findOne({
      where: { carId },
      order: { recordedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OdometerReading> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`OdometerReading ${id} not found`);
    return r;
  }

  async logReading(dto: {
    carId: string;
    readingKm: number;
    recordedAt: string;
    source?: OdometerSource;
    notes?: string;
    createdBy?: string;
  }): Promise<OdometerReading> {
    const reading = await this.repo.save(
      this.repo.create({
        carId:      dto.carId,
        readingKm:  dto.readingKm,
        recordedAt: new Date(dto.recordedAt),
        source:     dto.source ?? 'manual',
        notes:      dto.notes ?? null,
        createdBy:  dto.createdBy ?? null,
      }),
    );

    // Trigger mileage-threshold check in the background
    await this.queue.add(
      'mileage-threshold',
      { carId: dto.carId, currentKm: dto.readingKm },
      {
        jobId:    `mileage.${dto.carId}.${reading.id}`,
        attempts: 2,
        backoff:  { type: 'exponential', delay: 10_000 },
      },
    );

    return reading;
  }

  async remove(id: string): Promise<void> {
    const r = await this.findOne(id);
    await this.repo.delete(r.id);
  }
}
