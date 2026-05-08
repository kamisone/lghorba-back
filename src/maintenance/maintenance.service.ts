import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceRecord, MaintenanceStatus } from './entities/maintenance-record.entity';
import { MaintenanceType } from './entities/maintenance-type.entity';
import { MaintenanceSupplier } from './entities/maintenance-supplier.entity';
import { VehicleAvailabilityService } from '../vehicle-availability/vehicle-availability.service';

// Status transitions: which target statuses are allowed from a given source
const TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  planned:       ['scheduled', 'in_progress', 'cancelled'],
  scheduled:     ['in_progress', 'cancelled'],
  in_progress:   ['waiting_parts', 'completed', 'cancelled'],
  waiting_parts: ['in_progress', 'completed', 'cancelled'],
  completed:     [],
  cancelled:     [],
};

const BLOCKING_STATUSES: MaintenanceStatus[] = ['scheduled', 'in_progress', 'waiting_parts'];

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectRepository(MaintenanceRecord)
    private readonly recordRepo: Repository<MaintenanceRecord>,
    @InjectRepository(MaintenanceType)
    private readonly typeRepo: Repository<MaintenanceType>,
    @InjectRepository(MaintenanceSupplier)
    private readonly supplierRepo: Repository<MaintenanceSupplier>,
    private readonly availabilityService: VehicleAvailabilityService,
  ) {}

  // ── Records ───────────────────────────────────────────────────────────────

  async findAll(filters: {
    carId?: string; status?: MaintenanceStatus; from?: string; to?: string;
  }): Promise<MaintenanceRecord[]> {
    const qb = this.recordRepo.createQueryBuilder('mr').orderBy('mr.createdAt', 'DESC');
    if (filters.carId)  qb.andWhere('mr.carId = :carId',       { carId: filters.carId });
    if (filters.status) qb.andWhere('mr.status = :status',     { status: filters.status });
    if (filters.from)   qb.andWhere('mr.scheduledDate >= :from', { from: filters.from });
    if (filters.to)     qb.andWhere('mr.scheduledDate <= :to',   { to: filters.to });
    return qb.getMany();
  }

  async findOne(id: string): Promise<MaintenanceRecord> {
    const r = await this.recordRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`MaintenanceRecord ${id} not found`);
    return r;
  }

  async create(dto: {
    carId: string; maintenanceTypeId: string; title: string;
    status?: MaintenanceStatus; scheduledDate?: string; description?: string;
    supplierId?: string; costEur?: number; invoiceRef?: string;
    odometerAtServiceKm?: number; notes?: string;
  }): Promise<MaintenanceRecord> {
    const type = await this.typeRepo.findOne({ where: { id: dto.maintenanceTypeId } });
    if (!type) throw new BadRequestException(`MaintenanceType ${dto.maintenanceTypeId} not found`);

    const record = this.recordRepo.create({
      carId:               dto.carId,
      maintenanceTypeId:   dto.maintenanceTypeId,
      title:               dto.title,
      status:              dto.status ?? 'planned',
      scheduledDate:       dto.scheduledDate ?? null,
      description:         dto.description ?? null,
      supplierId:          dto.supplierId ?? null,
      costEur:             dto.costEur ?? null,
      invoiceRef:          dto.invoiceRef ?? null,
      odometerAtServiceKm: dto.odometerAtServiceKm ?? null,
      notes:               dto.notes ?? null,
    });
    const saved = await this.recordRepo.save(record);

    // Create availability block if starting in a blocking status
    if (dto.status && BLOCKING_STATUSES.includes(dto.status) && dto.scheduledDate) {
      await this.createAvailabilityBlock(saved);
    }

    return saved;
  }

  async update(id: string, dto: Partial<{
    title: string; description: string; scheduledDate: string;
    supplierId: string | null; costEur: number; invoiceRef: string;
    odometerAtServiceKm: number; notes: string;
  }>): Promise<MaintenanceRecord> {
    const record = await this.findOne(id);
    Object.assign(record, dto);
    return this.recordRepo.save(record);
  }

  async transitionStatus(id: string, newStatus: MaintenanceStatus): Promise<MaintenanceRecord> {
    const record = await this.findOne(id);
    const allowed = TRANSITIONS[record.status];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${record.status}" to "${newStatus}"`,
      );
    }

    // Timestamps
    if (newStatus === 'in_progress' && !record.startedAt) record.startedAt = new Date();
    if (newStatus === 'completed')                        record.completedAt = new Date();

    record.status = newStatus;

    // Create/remove VehicleAvailability block
    if (BLOCKING_STATUSES.includes(newStatus) && !record.vehicleAvailabilityId) {
      await this.createAvailabilityBlock(record);
    }
    if ((newStatus === 'completed' || newStatus === 'cancelled') && record.vehicleAvailabilityId) {
      await this.removeAvailabilityBlock(record);
    }

    return this.recordRepo.save(record);
  }

  async remove(id: string): Promise<void> {
    const record = await this.findOne(id);
    if (record.vehicleAvailabilityId) await this.removeAvailabilityBlock(record);
    await this.recordRepo.delete(id);
  }

  async findOverdue(): Promise<MaintenanceRecord[]> {
    const today = new Date().toISOString().slice(0, 10);
    return this.recordRepo
      .createQueryBuilder('mr')
      .where('mr.status NOT IN (:...done)', { done: ['completed', 'cancelled'] })
      .andWhere('mr.scheduledDate < :today', { today })
      .andWhere('mr.scheduledDate IS NOT NULL')
      .orderBy('mr.scheduledDate', 'ASC')
      .getMany();
  }

  async getCostSummary(carId: string, from?: string, to?: string) {
    const qb = this.recordRepo
      .createQueryBuilder('mr')
      .where('mr.carId = :carId', { carId })
      .andWhere('mr.status = :completed', { completed: 'completed' })
      .andWhere('mr.costEur IS NOT NULL');

    if (from) qb.andWhere('mr.completedAt >= :from', { from });
    if (to)   qb.andWhere('mr.completedAt <= :to',   { to });

    const records = await qb.getMany();
    const total = records.reduce((s, r) => s + Number(r.costEur ?? 0), 0);

    return {
      totalCostEur: Math.round(total * 100) / 100,
      count: records.length,
      avgCostEur: records.length > 0 ? Math.round((total / records.length) * 100) / 100 : 0,
    };
  }

  // ── Types ─────────────────────────────────────────────────────────────────

  findAllTypes(): Promise<MaintenanceType[]> {
    return this.typeRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  findAllTypesIncludingInactive(): Promise<MaintenanceType[]> {
    return this.typeRepo.find({ order: { name: 'ASC' } });
  }

  async createType(dto: {
    name: string; code: string; description?: string;
    defaultCostEur?: number; intervalDays?: number; intervalKm?: number;
  }): Promise<MaintenanceType> {
    return this.typeRepo.save(this.typeRepo.create({ ...dto, isActive: true }));
  }

  async updateType(id: string, dto: Partial<{
    name: string; description: string; defaultCostEur: number;
    intervalDays: number; intervalKm: number; isActive: boolean;
  }>): Promise<MaintenanceType> {
    const type = await this.typeRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException(`MaintenanceType ${id} not found`);
    Object.assign(type, dto);
    return this.typeRepo.save(type);
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  findAllSuppliers(): Promise<MaintenanceSupplier[]> {
    return this.supplierRepo.find({ order: { name: 'ASC' } });
  }

  async createSupplier(dto: {
    name: string; address?: string; phone?: string; email?: string;
    specialty?: string; notes?: string;
  }): Promise<MaintenanceSupplier> {
    return this.supplierRepo.save(this.supplierRepo.create(dto));
  }

  async updateSupplier(id: string, dto: Partial<{
    name: string; address: string; phone: string; email: string;
    specialty: string; notes: string;
  }>): Promise<MaintenanceSupplier> {
    const s = await this.supplierRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`MaintenanceSupplier ${id} not found`);
    Object.assign(s, dto);
    return this.supplierRepo.save(s);
  }

  async removeSupplier(id: string): Promise<void> {
    const s = await this.supplierRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`MaintenanceSupplier ${id} not found`);
    await this.supplierRepo.delete(id);
  }

  // ── Availability block helpers ────────────────────────────────────────────

  private async createAvailabilityBlock(record: MaintenanceRecord): Promise<void> {
    if (!record.scheduledDate) return;
    try {
      const block = await this.availabilityService.create(record.carId, {
        startDate: record.scheduledDate,
        endDate:   record.scheduledDate,
        reason:    `Maintenance: ${record.title}`,
        notes:     `Auto-created by maintenance record ${record.id}`,
      });
      record.vehicleAvailabilityId = block.id;
      await this.recordRepo.save(record);
    } catch (err) {
      this.logger.warn(`Failed to create availability block for record ${record.id}: ${(err as Error).message}`);
    }
  }

  private async removeAvailabilityBlock(record: MaintenanceRecord): Promise<void> {
    if (!record.vehicleAvailabilityId) return;
    try {
      await this.availabilityService.remove(record.vehicleAvailabilityId);
      record.vehicleAvailabilityId = null;
      await this.recordRepo.save(record);
    } catch (err) {
      this.logger.warn(`Failed to remove availability block for record ${record.id}: ${(err as Error).message}`);
    }
  }
}
