import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';

interface FindAllParams {
  search?: string;
  limit?: number;
  minRents?: number;
  maxRents?: number;
  minScore?: number;
  maxScore?: number;
  joinedFrom?: string;
  joinedTo?: string;
  rentFrom?: string;
  rentTo?: string;
  activeOnly?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
  ) {}

  async findAll(params: FindAllParams = {}): Promise<(User & { rentCount: number; hasActiveSession: boolean })[]> {
    const { search, limit = 100, minRents, maxRents, minScore, maxScore, joinedFrom, joinedTo, rentFrom, rentTo, activeOnly } = params;

    const rentCountSubquery = `COALESCE((
      SELECT COUNT(DISTINCT sq.sid)::int FROM (
        SELECT s.id AS sid FROM rent_sessions s WHERE s."userId" = u.id
        UNION
        SELECT s.id AS sid FROM rent_sessions s
        JOIN bookings b ON s."bookingId" = b.id
        WHERE b."userId" = u.id
      ) sq
    ), 0)`;

    const qb = this.repo
      .createQueryBuilder('u')
      .addSelect(rentCountSubquery, 'u_rentCount')
      .addSelect(`(
        EXISTS (
          SELECT 1 FROM rent_sessions s WHERE s."userId" = u.id AND s.status = 'active'
          UNION ALL
          SELECT 1 FROM rent_sessions s
          JOIN bookings b ON s."bookingId" = b.id
          WHERE b."userId" = u.id AND s.status = 'active'
        )
      )`, 'u_hasActiveSession')
      .orderBy('u.createdAt', 'DESC')
      .take(limit);

    if (search) {
      qb.andWhere('u.name ILIKE :s OR u.phone ILIKE :s', { s: `%${search}%` });
    }

    if (minRents !== undefined && !isNaN(minRents)) {
      qb.andWhere(`${rentCountSubquery} >= :minRents`, { minRents });
    }

    if (maxRents !== undefined && !isNaN(maxRents)) {
      qb.andWhere(`${rentCountSubquery} <= :maxRents`, { maxRents });
    }

    if (minScore !== undefined && !isNaN(minScore)) {
      qb.andWhere('u.score >= :minScore', { minScore });
    }

    if (maxScore !== undefined && !isNaN(maxScore)) {
      qb.andWhere('u.score <= :maxScore', { maxScore });
    }

    if (joinedFrom) {
      qb.andWhere('u.createdAt >= :joinedFrom', { joinedFrom: new Date(joinedFrom) });
    }

    if (joinedTo) {
      qb.andWhere('u.createdAt < :joinedTo', { joinedTo: new Date(`${joinedTo}T23:59:59`) });
    }

    if (rentFrom || rentTo) {
      let activityCond = `EXISTS (
        SELECT 1 FROM rent_sessions rs
        LEFT JOIN bookings b2 ON rs."bookingId" = b2.id
        WHERE (rs."userId" = u.id OR b2."userId" = u.id)`;
      const activityParams: Record<string, Date> = {};
      if (rentFrom) { activityCond += ` AND rs."startedAt" >= :rentFrom`; activityParams.rentFrom = new Date(rentFrom); }
      if (rentTo) { activityCond += ` AND rs."startedAt" <= :rentTo`; activityParams.rentTo = new Date(`${rentTo}T23:59:59`); }
      activityCond += ')';
      qb.andWhere(activityCond, activityParams);
    }

    if (activeOnly) {
      qb.andWhere(`EXISTS (
        SELECT 1 FROM rent_sessions s WHERE s."userId" = u.id AND s.status = 'active'
        UNION ALL
        SELECT 1 FROM rent_sessions s
        JOIN bookings b ON s."bookingId" = b.id
        WHERE b."userId" = u.id AND s.status = 'active'
      )`);
    }

    const { entities, raw } = await qb.getRawAndEntities();
    return entities.map((u, i) => ({
      ...u,
      rentCount: raw[i]?.u_rentCount ?? 0,
      hasActiveSession: raw[i]?.u_hasActiveSession ?? false,
    })) as (User & { rentCount: number; hasActiveSession: boolean })[];
  }

  async create(dto: CreateUserDto): Promise<User> {
    const session = await this.sessionRepo.findOne({ where: { id: dto.rentSessionId } });
    if (!session) throw new NotFoundException(`RentSession ${dto.rentSessionId} not found`);
    if (session.userId) throw new BadRequestException(`Session is already linked to a user`);

    if (dto.phone) {
      const conflict = await this.repo
        .createQueryBuilder('u')
        .where('LOWER(u.name) = LOWER(:name)', { name: dto.name })
        .andWhere('LOWER(u.phone) = LOWER(:phone)', { phone: dto.phone })
        .getOne();
      if (conflict) throw new ConflictException(`User with this name and phone already exists`);
    }

    const user = await this.repo.save(
      this.repo.create({
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        score: dto.score ?? null,
        turoJoinDate: dto.turoJoinDate ?? null,
        getaroundJoinDate: dto.getaroundJoinDate ?? null,
        platformProfileUrl: dto.platformProfileUrl ?? null,
      }),
    );

    await this.sessionRepo.update(dto.rentSessionId, { userId: user.id });
    return user;
  }

  async findOne(id: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const [sessionsByBooking, sessionsDirect] = await Promise.all([
      this.sessionRepo
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.car', 'car')
        .innerJoinAndSelect('s.booking', 'bk')
        .where('bk.userId = :userId', { userId: id })
        .getMany(),
      this.sessionRepo
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.car', 'car')
        .leftJoinAndSelect('s.booking', 'bk')
        .where('s.userId = :userId', { userId: id })
        .getMany(),
    ]);

    const toShape = (s: RentSession) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      status: s.status,
      car: (s as any).car
        ? { id: (s as any).car.id, name: (s as any).car.name, immatriculation: (s as any).car.immatriculation }
        : null,
      booking: s.booking
        ? { id: s.booking.id, startDateTime: s.booking.startDateTime, endDateTime: s.booking.endDateTime, source: s.booking.source }
        : null,
    });

    const seenIds = new Set<string>();
    const rentSessions = [...sessionsByBooking, ...sessionsDirect]
      .filter((s) => { if (seenIds.has(s.id)) return false; seenIds.add(s.id); return true; })
      .map(toShape);

    return { ...user, rentCount: rentSessions.length, rentSessions };
  }

  async patch(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.email !== undefined) user.email = dto.email ?? null;
    if (dto.score !== undefined) user.score = dto.score ?? null;
    if (dto.turoJoinDate !== undefined) user.turoJoinDate = dto.turoJoinDate ?? null;
    if (dto.getaroundJoinDate !== undefined) user.getaroundJoinDate = dto.getaroundJoinDate ?? null;
    if (dto.platformProfileUrl !== undefined) user.platformProfileUrl = dto.platformProfileUrl ?? null;
    return this.repo.save(user);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    await this.repo.delete(id);
    return { ok: true };
  }

  async findOrCreate(
    name: string,
    phone: string,
    extras?: { email?: string | null; turoJoinDate?: string | null; getaroundJoinDate?: string | null; platformProfileUrl?: string | null },
  ): Promise<User> {
    const existing = await this.repo
      .createQueryBuilder('u')
      .where('LOWER(u.name) = LOWER(:name)', { name })
      .andWhere('LOWER(u.phone) = LOWER(:phone)', { phone })
      .getOne();
    if (existing) {
      let changed = false;
      if (extras?.email) { existing.email = extras.email; changed = true; }
      if (extras?.turoJoinDate) { existing.turoJoinDate = extras.turoJoinDate; changed = true; }
      if (extras?.getaroundJoinDate) { existing.getaroundJoinDate = extras.getaroundJoinDate; changed = true; }
      if (extras?.platformProfileUrl) { existing.platformProfileUrl = extras.platformProfileUrl; changed = true; }
      if (changed) await this.repo.save(existing);
      return existing;
    }
    return this.repo.save(
      this.repo.create({
        name,
        phone,
        email: extras?.email ?? null,
        turoJoinDate: extras?.turoJoinDate ?? null,
        getaroundJoinDate: extras?.getaroundJoinDate ?? null,
        platformProfileUrl: extras?.platformProfileUrl ?? null,
      }),
    );
  }

  async patchPlatformDates(
    id: string,
    turoJoinDate?: string | null,
    getaroundJoinDate?: string | null,
    email?: string | null,
    platformProfileUrl?: string | null,
  ): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) return;
    let changed = false;
    if (email) { user.email = email; changed = true; }
    if (turoJoinDate) { user.turoJoinDate = turoJoinDate; changed = true; }
    if (getaroundJoinDate) { user.getaroundJoinDate = getaroundJoinDate; changed = true; }
    if (platformProfileUrl) { user.platformProfileUrl = platformProfileUrl; changed = true; }
    if (changed) await this.repo.save(user);
  }
}
