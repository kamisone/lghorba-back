import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Car } from '../cars/car.entity';
import { MaintenanceRecord } from '../maintenance/entities/maintenance-record.entity';
import { OdometerReading } from '../odometer/entities/odometer-reading.entity';
import { VehicleHealthService } from '../vehicle-health/vehicle-health.service';

@Injectable()
export class FleetAnalyticsService {
  constructor(
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    @InjectRepository(MaintenanceRecord)
    private readonly maintenanceRepo: Repository<MaintenanceRecord>,
    @InjectRepository(OdometerReading)
    private readonly odometerRepo: Repository<OdometerReading>,
    private readonly healthService: VehicleHealthService,
  ) {}

  async getHealthOverview() {
    const [counts, totalCars] = await Promise.all([
      this.healthService.getStatusCounts(),
      this.carRepo.count(),
    ]);
    // Cars with no health record are implicitly 'healthy'
    const accountedFor = Object.values(counts).reduce((s, v) => s + v, 0);
    counts.healthy += Math.max(0, totalCars - accountedFor);
    return counts;
  }

  async getOverdueMaintenance() {
    const today = new Date().toISOString().slice(0, 10);
    return this.maintenanceRepo
      .createQueryBuilder('mr')
      .where('mr.status NOT IN (:...done)', { done: ['completed', 'cancelled'] })
      .andWhere('mr.scheduledDate < :today', { today })
      .andWhere('mr.scheduledDate IS NOT NULL')
      .orderBy('mr.scheduledDate', 'ASC')
      .limit(50)
      .getMany();
  }

  async getCostPerVehicle(from?: string, to?: string) {
    const cars = await this.carRepo.find({ select: ['id', 'name', 'brand', 'model'] });
    const results = [];

    for (const car of cars) {
      // Maintenance costs
      const qb = this.maintenanceRepo
        .createQueryBuilder('mr')
        .where('mr.carId = :carId', { carId: car.id })
        .andWhere('mr.status = :s', { s: 'completed' })
        .andWhere('mr.costEur IS NOT NULL');
      if (from) qb.andWhere('mr.completedAt >= :from', { from });
      if (to)   qb.andWhere('mr.completedAt <= :to', { to });
      const records = await qb.getMany();

      const totalCostEur = records.reduce((s, r) => s + Number(r.costEur ?? 0), 0);

      // Downtime (days in blocking statuses)
      const downtimeQb = this.maintenanceRepo
        .createQueryBuilder('mr')
        .where('mr.carId = :carId', { carId: car.id })
        .andWhere('mr.status IN (:...statuses)', { statuses: ['completed', 'in_progress', 'waiting_parts'] })
        .andWhere('mr.startedAt IS NOT NULL')
        .andWhere('mr.completedAt IS NOT NULL');
      if (from) downtimeQb.andWhere('mr.startedAt >= :from', { from });
      if (to)   downtimeQb.andWhere('mr.completedAt <= :to', { to });
      const downtimeRecords = await downtimeQb.getMany();
      const downtimeDays = downtimeRecords.reduce((s, r) => {
        const start = r.startedAt!.getTime();
        const end   = r.completedAt!.getTime();
        return s + Math.ceil((end - start) / 86_400_000);
      }, 0);

      // Odometer delta for cost-per-km
      const [earliest, latest] = await Promise.all([
        this.odometerRepo.findOne({
          where: { carId: car.id },
          order: { recordedAt: 'ASC' },
        }),
        this.odometerRepo.findOne({
          where: { carId: car.id },
          order: { recordedAt: 'DESC' },
        }),
      ]);
      const odometerDeltaKm = (earliest && latest && earliest.id !== latest.id)
        ? latest.readingKm - earliest.readingKm
        : null;
      const costPerKm = odometerDeltaKm && odometerDeltaKm > 0
        ? Math.round((totalCostEur / odometerDeltaKm) * 100) / 100
        : null;

      results.push({
        carId: car.id,
        name:  [car.brand, car.model].filter(Boolean).join(' ') || car.name,
        maintenanceCount: records.length,
        totalCostEur:     Math.round(totalCostEur * 100) / 100,
        downtimeDays,
        odometerDeltaKm,
        costPerKm,
      });
    }

    return results.sort((a, b) => b.totalCostEur - a.totalCostEur);
  }

  async getDowntime(carId?: string, from?: string, to?: string) {
    const qb = this.maintenanceRepo
      .createQueryBuilder('mr')
      .where('mr.status IN (:...statuses)', { statuses: ['completed', 'in_progress', 'waiting_parts'] })
      .andWhere('mr.startedAt IS NOT NULL')
      .andWhere('mr.completedAt IS NOT NULL');

    if (carId) qb.andWhere('mr.carId = :carId', { carId });
    if (from)  qb.andWhere('mr.startedAt >= :from', { from });
    if (to)    qb.andWhere('mr.completedAt <= :to', { to });

    const records = await qb.getMany();
    const totalDays = records.reduce((s, r) => {
      return s + Math.ceil((r.completedAt!.getTime() - r.startedAt!.getTime()) / 86_400_000);
    }, 0);

    return { totalDays, recordCount: records.length };
  }

  async getCostSummary(carId: string) {
    const records = await this.maintenanceRepo.find({
      where: { carId, status: 'completed' },
    });

    const totalCostEur = records.reduce((s, r) => s + Number(r.costEur ?? 0), 0);

    return {
      carId,
      totalCostEur:  Math.round(totalCostEur * 100) / 100,
      count:         records.length,
      avgCostEur:    records.length > 0 ? Math.round((totalCostEur / records.length) * 100) / 100 : 0,
    };
  }
}
