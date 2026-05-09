import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { RentPosition } from '../rent-sessions/rent-position.entity';
import { Booking } from '../bookings/booking.entity';
import { Car } from '../cars/car.entity';
import { RedisService } from '../redis/redis.service';
import { CACHE_TTL, cacheKey } from './analytics.constants';

export type Period = '7d' | '30d' | '90d';

// ── Response Types ─────────────────────────────────────────────────────────────

export interface OverviewResult {
  period: Period;
  totalFleet: number;
  activeNow: number;
  vehiclesWithTrips: number;
  utilizationRate: number;     // 0-100 %
  totalTrips: number;
  avgDurationSec: number;
  revenue: number;
  bookingCount: number;
}

export interface VehicleMetric {
  carId: string;
  name: string;
  immatriculation: string;
  tripCount: number;
  avgDurationSec: number;
  totalRentedHours: number;
  utilizationPct: number;
  revenue: number;
  bookingCount: number;
}

export interface FleetMetricsResult {
  period: Period;
  periodDays: number;
  vehicles: VehicleMetric[];
}

export interface DayStat {
  date: string;          // ISO date "YYYY-MM-DD"
  bookings: number;
  revenue: number;
  sources: Record<string, number>;
}

export interface UtilizationResult {
  period: Period;
  totalBookings: number;
  totalRevenue: number;
  avgDurationDays: number;
  sourceBreakdown: Record<string, number>;
  dailyStats: DayStat[];
}

export interface SessionSummary {
  id: string;
  carId: string;
  carName: string;
  immatriculation: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  positionCount: number;
}

export interface TelemetryResult {
  totalSessions: number;
  sessionsWithPositions: number;
  totalPositions: number;
  activeSessions: number;
  recentSessions: SessionSummary[];
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(RentPosition)
    private readonly positionRepo: Repository<RentPosition>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    private readonly redis: RedisService,
  ) {}

  // ── Cache helpers ──────────────────────────────────────────────────────────

  private async cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.client.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (e) {
      this.logger.warn(`Redis get failed for ${key}: ${(e as Error).message}`);
    }

    const result = await fn();

    try {
      await this.redis.client.set(key, JSON.stringify(result), 'EX', ttlSec);
    } catch (e) {
      this.logger.warn(`Redis set failed for ${key}: ${(e as Error).message}`);
    }

    return result;
  }

  async invalidateAll(): Promise<void> {
    try {
      const keys = await this.redis.client.keys('analytics:*');
      if (keys.length) await this.redis.client.del(...keys);
      this.logger.log(`Invalidated ${keys.length} analytics cache keys`);
    } catch (e) {
      this.logger.warn(`Cache invalidation failed: ${(e as Error).message}`);
    }
  }

  // ── Period helpers ─────────────────────────────────────────────────────────

  private periodDays(period: Period): number {
    return period === '7d' ? 7 : period === '30d' ? 30 : 90;
  }

  private periodStart(period: Period): Date {
    const d = new Date();
    d.setDate(d.getDate() - this.periodDays(period));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ── Overview ───────────────────────────────────────────────────────────────

  async getOverview(period: Period): Promise<OverviewResult> {
    return this.cached(
      cacheKey('overview', period),
      CACHE_TTL[period] ?? CACHE_TTL['30d'],
      () => this.computeOverview(period),
    );
  }

  private async computeOverview(period: Period): Promise<OverviewResult> {
    const from = this.periodStart(period);

    const [totalFleet, activeNow, tripRow, revRow] = await Promise.all([
      this.carRepo.count(),
      this.sessionRepo.count({ where: { status: 'active' as any } }),

      // Trip aggregates
      this.sessionRepo
        .createQueryBuilder('rs')
        .select('COUNT(rs.id)', 'totalTrips')
        .addSelect('COUNT(DISTINCT rs.carId)', 'vehiclesWithTrips')
        .addSelect(
          `AVG(EXTRACT(EPOCH FROM (rs."endedAt" - rs."startedAt")))`,
          'avgDurationSec',
        )
        .where('rs.startedAt >= :from', { from })
        .andWhere('rs.status = :status', { status: 'ended' })
        .andWhere('rs.endedAt IS NOT NULL')
        .getRawOne<{ totalTrips: string; vehiclesWithTrips: string; avgDurationSec: string }>(),

      // Revenue aggregates
      this.bookingRepo
        .createQueryBuilder('b')
        .select('COALESCE(SUM(b.totalEarning), 0)', 'revenue')
        .addSelect('COUNT(b.id)', 'bookingCount')
        .where('b.startDateTime >= :from', { from })
        .andWhere('b.status != :cancelled', { cancelled: 'cancelled' })
        .getRawOne<{ revenue: string; bookingCount: string }>(),
    ]);

    const vehiclesWithTrips = parseInt(tripRow?.vehiclesWithTrips ?? '0', 10);
    const utilizationRate = totalFleet > 0 ? (vehiclesWithTrips / totalFleet) * 100 : 0;

    return {
      period,
      totalFleet,
      activeNow,
      vehiclesWithTrips,
      utilizationRate: Math.round(utilizationRate * 10) / 10,
      totalTrips: parseInt(tripRow?.totalTrips ?? '0', 10),
      avgDurationSec: Math.round(parseFloat(tripRow?.avgDurationSec ?? '0')),
      revenue: Math.round(parseFloat(revRow?.revenue ?? '0') * 100) / 100,
      bookingCount: parseInt(revRow?.bookingCount ?? '0', 10),
    };
  }

  // ── Fleet Metrics ──────────────────────────────────────────────────────────

  async getFleetMetrics(period: Period): Promise<FleetMetricsResult> {
    return this.cached(
      cacheKey('fleet', period),
      CACHE_TTL[period] ?? CACHE_TTL['30d'],
      () => this.computeFleetMetrics(period),
    );
  }

  private async computeFleetMetrics(period: Period): Promise<FleetMetricsResult> {
    const from = this.periodStart(period);
    const days = this.periodDays(period);
    const periodHours = days * 24;

    const [cars, tripRows, revenueRows] = await Promise.all([
      this.carRepo.find({ select: ['id', 'name', 'immatriculation'] }),

      // Trip stats per car
      this.sessionRepo
        .createQueryBuilder('rs')
        .select('rs.carId', 'carId')
        .addSelect('COUNT(rs.id)', 'tripCount')
        .addSelect(
          `AVG(EXTRACT(EPOCH FROM (rs."endedAt" - rs."startedAt")))`,
          'avgDurationSec',
        )
        .addSelect(
          `SUM(EXTRACT(EPOCH FROM (rs."endedAt" - rs."startedAt"))) / 3600.0`,
          'rentedHours',
        )
        .where('rs.startedAt >= :from', { from })
        .andWhere('rs.status = :ended', { ended: 'ended' })
        .andWhere('rs.endedAt IS NOT NULL')
        .groupBy('rs.carId')
        .getRawMany<{ carId: string; tripCount: string; avgDurationSec: string; rentedHours: string }>(),

      // Revenue per car
      this.bookingRepo
        .createQueryBuilder('b')
        .select('b.carId', 'carId')
        .addSelect('COALESCE(SUM(b.totalEarning), 0)', 'revenue')
        .addSelect('COUNT(b.id)', 'bookingCount')
        .where('b.startDateTime >= :from', { from })
        .andWhere('b.status != :cancelled', { cancelled: 'cancelled' })
        .groupBy('b.carId')
        .getRawMany<{ carId: string; revenue: string; bookingCount: string }>(),
    ]);

    const tripByCarId = new Map(tripRows.map(r => [r.carId, r]));
    const revByCarId = new Map(revenueRows.map(r => [r.carId, r]));

    const vehicles: VehicleMetric[] = cars.map(car => {
      const trip = tripByCarId.get(car.id);
      const rev = revByCarId.get(car.id);
      const rentedHours = parseFloat(trip?.rentedHours ?? '0');
      const utilizationPct = Math.min(100, (rentedHours / periodHours) * 100);

      return {
        carId: car.id,
        name: car.name,
        immatriculation: car.immatriculation,
        tripCount: parseInt(trip?.tripCount ?? '0', 10),
        avgDurationSec: Math.round(parseFloat(trip?.avgDurationSec ?? '0')),
        totalRentedHours: Math.round(rentedHours * 10) / 10,
        utilizationPct: Math.round(utilizationPct * 10) / 10,
        revenue: Math.round(parseFloat(rev?.revenue ?? '0') * 100) / 100,
        bookingCount: parseInt(rev?.bookingCount ?? '0', 10),
      };
    });

    return { period, periodDays: days, vehicles };
  }

  // ── Utilization ────────────────────────────────────────────────────────────

  async getUtilization(period: Period): Promise<UtilizationResult> {
    return this.cached(
      cacheKey('utilization', period),
      CACHE_TTL[period] ?? CACHE_TTL['30d'],
      () => this.computeUtilization(period),
    );
  }

  private async computeUtilization(period: Period): Promise<UtilizationResult> {
    const from = this.periodStart(period);

    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .select(`DATE(b."startDateTime" AT TIME ZONE 'UTC')`, 'day')
      .addSelect('b.source', 'source')
      .addSelect('COUNT(b.id)', 'count')
      .addSelect('COALESCE(SUM(b.totalEarning), 0)', 'revenue')
      .addSelect(
        `AVG(EXTRACT(EPOCH FROM (b."endDateTime" - b."startDateTime")) / 86400.0)`,
        'avgDurationDays',
      )
      .where('b.startDateTime >= :from', { from })
      .andWhere('b.status != :cancelled', { cancelled: 'cancelled' })
      .groupBy(`DATE(b."startDateTime" AT TIME ZONE 'UTC'), b.source`)
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; source: string; count: string; revenue: string; avgDurationDays: string }>();

    // Build daily map
    const dayMap = new Map<string, DayStat>();
    let totalBookings = 0;
    let totalRevenue = 0;
    let totalDurationDays = 0;
    const sourceBreakdown: Record<string, number> = {};

    for (const row of rows) {
      const dateStr = typeof row.day === 'string'
        ? row.day.slice(0, 10)
        : new Date(row.day).toISOString().slice(0, 10);

      const count = parseInt(row.count, 10);
      const rev = parseFloat(row.revenue);
      const src = row.source ?? 'private';

      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, { date: dateStr, bookings: 0, revenue: 0, sources: {} });
      }
      const day = dayMap.get(dateStr)!;
      day.bookings += count;
      day.revenue += rev;
      day.sources[src] = (day.sources[src] ?? 0) + count;

      totalBookings += count;
      totalRevenue += rev;
      totalDurationDays += parseFloat(row.avgDurationDays) * count;
      sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + count;
    }

    // Fill in missing days with zeros
    const days = this.periodDays(period);
    const dailyStats: DayStat[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyStats.push(dayMap.get(dateStr) ?? { date: dateStr, bookings: 0, revenue: 0, sources: {} });
    }

    return {
      period,
      totalBookings,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgDurationDays: totalBookings > 0
        ? Math.round((totalDurationDays / totalBookings) * 10) / 10
        : 0,
      sourceBreakdown,
      dailyStats,
    };
  }

  // ── Telemetry ──────────────────────────────────────────────────────────────

  async getTelemetry(): Promise<TelemetryResult> {
    return this.cached(
      cacheKey('telemetry', 'recent'),
      CACHE_TTL.telemetry,
      () => this.computeTelemetry(),
    );
  }

  private async computeTelemetry(): Promise<TelemetryResult> {
    const [totalSessions, activeSessions, totalPositions, recentRows] = await Promise.all([
      this.sessionRepo.count(),
      this.sessionRepo.count({ where: { status: 'active' as any } }),
      this.positionRepo.count(),

      // Recent sessions with position count and car info
      this.sessionRepo
        .createQueryBuilder('rs')
        .leftJoin('cars', 'c', 'c.id = rs."carId"')
        .leftJoin('rent_positions', 'rp', 'rp."sessionId" = rs.id')
        .select('rs.id', 'id')
        .addSelect('rs.carId', 'carId')
        .addSelect('c.name', 'carName')
        .addSelect('c.immatriculation', 'immatriculation')
        .addSelect('rs.status', 'status')
        .addSelect('rs.startedAt', 'startedAt')
        .addSelect('rs.endedAt', 'endedAt')
        .addSelect('COUNT(rp.id)', 'positionCount')
        .groupBy('rs.id, c.name, c.immatriculation')
        .orderBy('rs."startedAt"', 'DESC')
        .limit(20)
        .getRawMany<{
          id: string;
          carId: string;
          carName: string;
          immatriculation: string;
          status: string;
          startedAt: Date;
          endedAt: Date | null;
          positionCount: string;
        }>(),
    ]);

    const sessionsWithPositions = recentRows.filter(r => parseInt(r.positionCount, 10) > 0).length;

    const recentSessions: SessionSummary[] = recentRows.map(r => ({
      id: r.id,
      carId: r.carId,
      carName: r.carName ?? r.carId,
      immatriculation: r.immatriculation ?? '',
      status: r.status,
      startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : String(r.startedAt),
      endedAt: r.endedAt
        ? (r.endedAt instanceof Date ? r.endedAt.toISOString() : String(r.endedAt))
        : null,
      positionCount: parseInt(r.positionCount, 10),
    }));

    return {
      totalSessions,
      sessionsWithPositions,
      totalPositions,
      activeSessions,
      recentSessions,
    };
  }

  // ── Cache warm (called by daily job) ──────────────────────────────────────

  async warmCache(): Promise<void> {
    this.logger.log('Warming analytics cache…');
    await this.invalidateAll();

    await Promise.all([
      this.computeOverview('7d').then(r => this.redis.client.set(
        cacheKey('overview', '7d'), JSON.stringify(r), 'EX', CACHE_TTL['7d'],
      )),
      this.computeOverview('30d').then(r => this.redis.client.set(
        cacheKey('overview', '30d'), JSON.stringify(r), 'EX', CACHE_TTL['30d'],
      )),
      this.computeOverview('90d').then(r => this.redis.client.set(
        cacheKey('overview', '90d'), JSON.stringify(r), 'EX', CACHE_TTL['90d'],
      )),
      this.computeFleetMetrics('30d').then(r => this.redis.client.set(
        cacheKey('fleet', '30d'), JSON.stringify(r), 'EX', CACHE_TTL['30d'],
      )),
      this.computeFleetMetrics('90d').then(r => this.redis.client.set(
        cacheKey('fleet', '90d'), JSON.stringify(r), 'EX', CACHE_TTL['90d'],
      )),
      this.computeUtilization('30d').then(r => this.redis.client.set(
        cacheKey('utilization', '30d'), JSON.stringify(r), 'EX', CACHE_TTL['30d'],
      )),
      this.computeUtilization('90d').then(r => this.redis.client.set(
        cacheKey('utilization', '90d'), JSON.stringify(r), 'EX', CACHE_TTL['90d'],
      )),
      this.computeTelemetry().then(r => this.redis.client.set(
        cacheKey('telemetry', 'recent'), JSON.stringify(r), 'EX', CACHE_TTL.telemetry,
      )),
    ]);

    this.logger.log('Analytics cache warmed');
  }
}
