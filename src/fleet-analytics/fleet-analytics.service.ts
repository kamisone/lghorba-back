import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Car } from '../cars/car.entity';
import { Booking, CANCELLED_STATUSES } from '../bookings/booking.entity';
import { Parking } from '../parkings/parking.entity';
import { MaintenanceRecord } from '../maintenance/entities/maintenance-record.entity';
import { OdometerReading } from '../odometer/entities/odometer-reading.entity';
import { VehicleHealthService } from '../vehicle-health/vehicle-health.service';
import { VehicleAvailabilityService } from '../vehicle-availability/vehicle-availability.service';

interface Interval {
  start: number;
  end: number;
}

@Injectable()
export class FleetAnalyticsService {
  constructor(
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    @InjectRepository(MaintenanceRecord)
    private readonly maintenanceRepo: Repository<MaintenanceRecord>,
    @InjectRepository(OdometerReading)
    private readonly odometerRepo: Repository<OdometerReading>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Parking)
    private readonly parkingRepo: Repository<Parking>,
    private readonly healthService: VehicleHealthService,
    private readonly availabilityService: VehicleAvailabilityService,
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
      .where('mr.status NOT IN (:...done)', {
        done: ['completed', 'cancelled'],
      })
      .andWhere('mr.scheduledDate < :today', { today })
      .andWhere('mr.scheduledDate IS NOT NULL')
      .orderBy('mr.scheduledDate', 'ASC')
      .limit(50)
      .getMany();
  }

  async getCostPerVehicle(from?: string, to?: string) {
    const cars = await this.carRepo.find({
      select: ['id', 'name', 'brand', 'model'],
    });
    const results = [];

    for (const car of cars) {
      // Maintenance costs
      const qb = this.maintenanceRepo
        .createQueryBuilder('mr')
        .where('mr.carId = :carId', { carId: car.id })
        .andWhere('mr.status = :s', { s: 'completed' })
        .andWhere('mr.costEur IS NOT NULL');
      if (from) qb.andWhere('mr.completedAt >= :from', { from });
      if (to) qb.andWhere('mr.completedAt <= :to', { to });
      const records = await qb.getMany();

      const totalCostEur = records.reduce(
        (s, r) => s + Number(r.costEur ?? 0),
        0,
      );

      // Downtime (days in blocking statuses)
      const downtimeQb = this.maintenanceRepo
        .createQueryBuilder('mr')
        .where('mr.carId = :carId', { carId: car.id })
        .andWhere('mr.status IN (:...statuses)', {
          statuses: ['completed', 'in_progress', 'waiting_parts'],
        })
        .andWhere('mr.startedAt IS NOT NULL')
        .andWhere('mr.completedAt IS NOT NULL');
      if (from) downtimeQb.andWhere('mr.startedAt >= :from', { from });
      if (to) downtimeQb.andWhere('mr.completedAt <= :to', { to });
      const downtimeRecords = await downtimeQb.getMany();
      const downtimeDays = downtimeRecords.reduce((s, r) => {
        const start = r.startedAt!.getTime();
        const end = r.completedAt!.getTime();
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
      const odometerDeltaKm =
        earliest && latest && earliest.id !== latest.id
          ? latest.readingKm - earliest.readingKm
          : null;
      const costPerKm =
        odometerDeltaKm && odometerDeltaKm > 0
          ? Math.round((totalCostEur / odometerDeltaKm) * 100) / 100
          : null;

      results.push({
        carId: car.id,
        name: [car.brand, car.model].filter(Boolean).join(' ') || car.name,
        maintenanceCount: records.length,
        totalCostEur: Math.round(totalCostEur * 100) / 100,
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
      .where('mr.status IN (:...statuses)', {
        statuses: ['completed', 'in_progress', 'waiting_parts'],
      })
      .andWhere('mr.startedAt IS NOT NULL')
      .andWhere('mr.completedAt IS NOT NULL');

    if (carId) qb.andWhere('mr.carId = :carId', { carId });
    if (from) qb.andWhere('mr.startedAt >= :from', { from });
    if (to) qb.andWhere('mr.completedAt <= :to', { to });

    const records = await qb.getMany();
    const totalDays = records.reduce((s, r) => {
      return (
        s +
        Math.ceil(
          (r.completedAt!.getTime() - r.startedAt!.getTime()) / 86_400_000,
        )
      );
    }, 0);

    return { totalDays, recordCount: records.length };
  }

  async getCostSummary(carId: string) {
    const records = await this.maintenanceRepo.find({
      where: { carId, status: 'completed' },
    });

    const totalCostEur = records.reduce(
      (s, r) => s + Number(r.costEur ?? 0),
      0,
    );

    return {
      carId,
      totalCostEur: Math.round(totalCostEur * 100) / 100,
      count: records.length,
      avgCostEur:
        records.length > 0
          ? Math.round((totalCostEur / records.length) * 100) / 100
          : 0,
    };
  }

  // ── Idle Days ─────────────────────────────────────────────────────────────
  // "Idle" = no non-cancelled booking AND no availability block overlaps that
  // day. Used to surface good days to schedule cleaning/servicing.

  private assertRangeWithinBounds(from: string, to: string): void {
    const days = Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    );
    if (days < 0 || days > 400) {
      throw new BadRequestException(
        'Date range must be between 0 and 400 days',
      );
    }
  }

  private async loadIdleContext(from: string, to: string, parkingId?: string) {
    const carsQb = this.carRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.name', 'c.immatriculation', 'c.parkingId']);
    if (parkingId) carsQb.andWhere('c.parkingId = :parkingId', { parkingId });
    const cars = await carsQb.getMany();
    const carIds = cars.map((c) => c.id);

    const bookingsByCarId = new Map<string, Interval[]>();
    const blocksByCarId = new Map<string, Interval[]>();

    if (carIds.length > 0) {
      const fromDt = `${from}T00:00:00.000Z`;
      const toDt = `${to}T23:59:59.999Z`;

      const [bookings, blocks] = await Promise.all([
        this.bookingRepo
          .createQueryBuilder('b')
          .select(['b.id', 'b.carId', 'b.startDateTime', 'b.endDateTime'])
          .where('b.carId IN (:...carIds)', { carIds })
          .andWhere('b.status NOT IN (:...cancelled)', {
            cancelled: CANCELLED_STATUSES,
          })
          .andWhere('b.startDateTime <= :toDt', { toDt })
          .andWhere('b.endDateTime   >= :fromDt', { fromDt })
          .getMany(),
        this.availabilityService.findOverlappingForCars(carIds, from, to),
      ]);

      for (const b of bookings) {
        const arr = bookingsByCarId.get(b.carId) ?? [];
        arr.push({
          start: new Date(b.startDateTime).getTime(),
          end: new Date(b.endDateTime).getTime(),
        });
        bookingsByCarId.set(b.carId, arr);
      }
      for (const blk of blocks) {
        const arr = blocksByCarId.get(blk.carId) ?? [];
        arr.push({
          start: new Date(`${blk.startDate}T00:00:00.000Z`).getTime(),
          end: new Date(`${blk.endDate}T23:59:59.999Z`).getTime(),
        });
        blocksByCarId.set(blk.carId, arr);
      }
    }

    return { cars, bookingsByCarId, blocksByCarId };
  }

  private idleCarIdsForDay(
    date: string,
    cars: { id: string }[],
    bookingsByCarId: Map<string, Interval[]>,
    blocksByCarId: Map<string, Interval[]>,
  ): string[] {
    const dayStart = new Date(`${date}T00:00:00.000Z`).getTime();
    const dayEnd = dayStart + 86_400_000 - 1;
    return cars
      .filter((car) => {
        const busy =
          (bookingsByCarId.get(car.id) ?? []).some(
            (iv) => iv.start <= dayEnd && iv.end >= dayStart,
          ) ||
          (blocksByCarId.get(car.id) ?? []).some(
            (iv) => iv.start <= dayEnd && iv.end >= dayStart,
          );
        return !busy;
      })
      .map((car) => car.id);
  }

  async getIdleDays(from: string, to: string, parkingId?: string) {
    this.assertRangeWithinBounds(from, to);
    const { cars, bookingsByCarId, blocksByCarId } = await this.loadIdleContext(
      from,
      to,
      parkingId,
    );
    const fleetSize = cars.length;

    const days: {
      date: string;
      idleCount: number;
      busyCount: number;
      idleCarIds: string[];
    }[] = [];
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`).getTime();
    while (cursor.getTime() <= end) {
      const date = cursor.toISOString().slice(0, 10);
      const idleCarIds = this.idleCarIdsForDay(
        date,
        cars,
        bookingsByCarId,
        blocksByCarId,
      );
      days.push({
        date,
        idleCount: idleCarIds.length,
        busyCount: fleetSize - idleCarIds.length,
        idleCarIds,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return { from, to, fleetSize, parkingId: parkingId ?? null, days };
  }

  async getIdleDayDetail(date: string, parkingId?: string) {
    const { cars, bookingsByCarId, blocksByCarId } = await this.loadIdleContext(
      date,
      date,
      parkingId,
    );
    const idleCarIds = new Set(
      this.idleCarIdsForDay(date, cars, bookingsByCarId, blocksByCarId),
    );
    const idleCars = cars.filter((c) => idleCarIds.has(c.id));

    const parkingIds = [
      ...new Set(
        idleCars.map((c) => c.parkingId).filter((id): id is string => !!id),
      ),
    ];
    const parkings = parkingIds.length
      ? await this.parkingRepo.find({
          where: { id: In(parkingIds) },
          select: ['id', 'label'],
        })
      : [];
    const parkingLabelById = new Map(parkings.map((p) => [p.id, p.label]));

    return {
      date,
      idleCount: idleCars.length,
      cars: idleCars.map((c) => ({
        carId: c.id,
        name: c.name,
        immatriculation: c.immatriculation,
        parkingId: c.parkingId,
        parkingLabel: c.parkingId
          ? parkingLabelById.get(c.parkingId) ?? null
          : null,
      })),
    };
  }
}
