import { Logger } from '@nestjs/common';
import { Processor, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { FLEET_MAINTENANCE_QUEUE } from './maintenance-jobs.constants';
import { MaintenanceRecord } from '../maintenance/entities/maintenance-record.entity';
import { MaintenanceType } from '../maintenance/entities/maintenance-type.entity';
import { OdometerReading } from '../odometer/entities/odometer-reading.entity';
import { VehicleHealthService } from '../vehicle-health/vehicle-health.service';
import { MaintenanceService } from '../maintenance/maintenance.service';

interface MileageThresholdJob { carId: string; currentKm: number }

@Processor(FLEET_MAINTENANCE_QUEUE)
export class MaintenanceJobsProcessor extends DlqAwareWorker {
  protected readonly queueName = FLEET_MAINTENANCE_QUEUE;
  private readonly logger = new Logger(MaintenanceJobsProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(MaintenanceRecord)
    private readonly maintenanceRepo: Repository<MaintenanceRecord>,
    @InjectRepository(MaintenanceType)
    private readonly typeRepo: Repository<MaintenanceType>,
    @InjectRepository(OdometerReading)
    private readonly odometerRepo: Repository<OdometerReading>,
    @InjectQueue(FLEET_MAINTENANCE_QUEUE)
    private readonly queue: Queue,
    private readonly healthService: VehicleHealthService,
    private readonly maintenanceService: MaintenanceService,
  ) {
    super(dlqService);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'mileage-threshold': return this.handleMileageThreshold(job as Job<MileageThresholdJob>);
      default: this.logger.warn(`Unknown fleet-maintenance job: ${job.name}`);
    }
  }

  // ── Cron: daily overdue check at 08:00 ───────────────────────────────────

  @Cron('0 8 * * *')
  async dailyOverdueCheck(): Promise<void> {
    this.logger.log('Running daily overdue maintenance check');
    const overdue = await this.maintenanceService.findOverdue();

    for (const record of overdue) {
      const current = await this.healthService.getHealthStatus(record.carId);
      if (current === 'healthy' || current === 'warning') {
        await this.healthService.setHealth(
          record.carId, 'needs_service',
          `Overdue maintenance: ${record.title}`,
        );
      }
      this.logger.warn(`Overdue maintenance: ${record.id} for car ${record.carId} — ${record.title}`);
    }

    this.logger.log(`Overdue check complete. Found ${overdue.length} overdue record(s).`);
  }

  // ── Cron: weekly inspection expiry check on Monday at 09:00 ──────────────

  @Cron('0 9 * * 1')
  async weeklyInspectionExpiryCheck(): Promise<void> {
    this.logger.log('Running weekly inspection expiry check');
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const in30Days  = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    // Find the "technical_inspection" maintenance type
    const techType = await this.typeRepo.findOne({ where: { code: 'technical_inspection' } });
    if (!techType) return;

    // Cars that have an overdue technical inspection (no completed record in the past year)
    const recentInspections: { carId: string }[] = await this.maintenanceRepo
      .createQueryBuilder('mr')
      .select('DISTINCT mr.carId', 'carId')
      .where('mr.maintenanceTypeId = :typeId', { typeId: techType.id })
      .andWhere('mr.status = :s', { s: 'completed' })
      .andWhere('mr.completedAt >= :cutoff', { cutoff: cutoffStr })
      .getRawMany();

    const recentCarIds = new Set(recentInspections.map(r => r.carId));

    // Pending inspections already scheduled for cars without recent completion
    const pending: { carId: string }[] = await this.maintenanceRepo
      .createQueryBuilder('mr')
      .select('DISTINCT mr.carId', 'carId')
      .where('mr.maintenanceTypeId = :typeId', { typeId: techType.id })
      .andWhere('mr.status NOT IN (:...done)', { done: ['completed', 'cancelled'] })
      .getRawMany();

    const pendingCarIds = new Set(pending.map(r => r.carId));

    // Get all cars
    const allCars: { id: string }[] = await this.maintenanceRepo
      .createQueryBuilder('mr')
      .select('DISTINCT mr.carId', 'id')
      .getRawMany();

    for (const { id: carId } of allCars) {
      if (recentCarIds.has(carId) || pendingCarIds.has(carId)) continue;

      // Create a planned reminder
      await this.maintenanceService.create({
        carId,
        maintenanceTypeId: techType.id,
        title:             'Technical Inspection Due',
        status:            'planned',
        scheduledDate:     in30Days,
        notes:             'Auto-generated: annual technical inspection due',
      });

      await this.healthService.setHealth(carId, 'warning', 'Annual technical inspection due');
      this.logger.log(`Created inspection reminder for car ${carId}`);
    }
  }

  // ── Job: mileage threshold check ──────────────────────────────────────────

  private async handleMileageThreshold(job: Job<MileageThresholdJob>): Promise<void> {
    const { carId, currentKm } = job.data;
    this.logger.log(`Checking mileage thresholds for car ${carId} at ${currentKm} km`);

    const types = await this.typeRepo.find({
      where: { isActive: true },
    });

    for (const type of types) {
      if (!type.intervalKm) continue;

      // Find the last completed maintenance of this type
      const lastCompleted = await this.maintenanceRepo.findOne({
        where: { carId, maintenanceTypeId: type.id, status: 'completed' },
        order: { completedAt: 'DESC' },
      });

      const baseKm = lastCompleted?.odometerAtServiceKm ?? 0;
      const nextDueKm = baseKm + type.intervalKm;

      if (currentKm < nextDueKm) continue;

      // Check if there's already a planned/scheduled record for this type
      const pending = await this.maintenanceRepo.findOne({
        where: {
          carId,
          maintenanceTypeId: type.id,
          status: 'planned' as any,
        },
      });
      if (pending) continue;

      const overageRatio = (currentKm - nextDueKm) / type.intervalKm;
      const today = new Date().toISOString().slice(0, 10);

      await this.maintenanceService.create({
        carId,
        maintenanceTypeId: type.id,
        title:             `${type.name} due (${currentKm} km)`,
        status:            'planned',
        scheduledDate:     today,
        notes:             `Auto-generated: mileage threshold reached at ${currentKm} km`,
      });

      if (overageRatio > 0.2) {
        await this.healthService.setHealth(
          carId, 'needs_service',
          `${type.name} overdue by ${currentKm - nextDueKm} km`,
        );
      }

      this.logger.log(`Created ${type.name} reminder for car ${carId} at ${currentKm} km`);
    }
  }
}
