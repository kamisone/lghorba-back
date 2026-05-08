import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BLOCKING_STATUSES, VehicleHealthRecord, VehicleHealthStatus } from './entities/vehicle-health-record.entity';

@Injectable()
export class VehicleHealthService {
  constructor(
    @InjectRepository(VehicleHealthRecord)
    private readonly repo: Repository<VehicleHealthRecord>,
  ) {}

  async getHealthStatus(carId: string): Promise<VehicleHealthStatus> {
    const record = await this.repo.findOne({ where: { carId } });
    return record?.status ?? 'healthy';
  }

  async getRecord(carId: string): Promise<VehicleHealthRecord | null> {
    return this.repo.findOne({ where: { carId } });
  }

  /** Returns carIds where health status blocks booking eligibility (unsafe | critical). */
  async getBlockingCarIds(): Promise<Set<string>> {
    const rows = await this.repo
      .createQueryBuilder('vhr')
      .select('vhr.carId', 'carId')
      .where('vhr.status IN (:...statuses)', { statuses: BLOCKING_STATUSES })
      .getRawMany<{ carId: string }>();
    return new Set(rows.map(r => r.carId));
  }

  async setHealth(
    carId: string,
    status: VehicleHealthStatus,
    reason?: string,
  ): Promise<VehicleHealthRecord> {
    const existing = await this.repo.findOne({ where: { carId } });

    if (existing) {
      existing.status        = status;
      existing.reason        = reason ?? null;
      existing.lastCheckedAt = new Date();
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({ carId, status, reason: reason ?? null, lastCheckedAt: new Date() }),
    );
  }

  async getAll(): Promise<VehicleHealthRecord[]> {
    return this.repo.find();
  }

  async getHealthMap(): Promise<Map<string, VehicleHealthStatus>> {
    const all = await this.repo.find({ select: ['carId', 'status'] });
    return new Map(all.map(r => [r.carId, r.status]));
  }

  async removeRecord(carId: string): Promise<void> {
    const record = await this.repo.findOne({ where: { carId } });
    if (record) await this.repo.delete(record.id);
  }

  /** Used by analytics to count per status. */
  async getStatusCounts(): Promise<Record<VehicleHealthStatus, number>> {
    const rows: { status: VehicleHealthStatus; count: string }[] = await this.repo
      .createQueryBuilder('vhr')
      .select('vhr.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('vhr.status')
      .getRawMany();

    const result: Record<string, number> = {
      healthy: 0, warning: 0, critical: 0, unsafe: 0, needs_service: 0,
    };
    for (const r of rows) result[r.status] = parseInt(r.count, 10);
    return result as Record<VehicleHealthStatus, number>;
  }
}
