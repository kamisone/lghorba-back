import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
  ) {}

  async findAll(search?: string, limit = 20): Promise<(User & { rentCount: number })[]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .addSelect(`(
        SELECT COUNT(DISTINCT sq.sid)::int FROM (
          SELECT s.id AS sid FROM rent_sessions s WHERE s."userId" = u.id
          UNION
          SELECT s.id AS sid FROM rent_sessions s
          JOIN rent_schedules sch ON s."scheduleId" = sch.id
          WHERE sch."userId" = u.id
        ) sq
      )`, 'u_rentCount')
      .addSelect(`(
        EXISTS (
          SELECT 1 FROM rent_sessions s WHERE s."userId" = u.id AND s.status = 'active'
          UNION ALL
          SELECT 1 FROM rent_sessions s
          JOIN rent_schedules sch ON s."scheduleId" = sch.id
          WHERE sch."userId" = u.id AND s.status = 'active'
        )
      )`, 'u_hasActiveSession')
      .orderBy('u.createdAt', 'DESC')
      .take(limit);
    if (search) {
      qb.where('u.name ILIKE :s OR u.phone ILIKE :s', { s: `%${search}%` });
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
      }),
    );

    await this.sessionRepo.update(dto.rentSessionId, { userId: user.id });
    return user;
  }

  async findOne(id: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const [sessionsBySchedule, sessionsDirect] = await Promise.all([
      this.sessionRepo
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.car', 'car')
        .innerJoinAndSelect('s.schedule', 'sch')
        .where('sch.userId = :userId', { userId: id })
        .getMany(),
      this.sessionRepo
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.car', 'car')
        .leftJoinAndSelect('s.schedule', 'sch')
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
      schedule: s.schedule
        ? { id: s.schedule.id, fromDate: s.schedule.fromDate, toDate: s.schedule.toDate }
        : null,
    });

    const seenIds = new Set<string>();
    const rentSessions = [...sessionsBySchedule, ...sessionsDirect]
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
    extras?: { email?: string | null; turoJoinDate?: string | null; getaroundJoinDate?: string | null },
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
      }),
    );
  }

  async patchPlatformDates(
    id: string,
    turoJoinDate?: string | null,
    getaroundJoinDate?: string | null,
    email?: string | null,
  ): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) return;
    let changed = false;
    if (email) { user.email = email; changed = true; }
    if (turoJoinDate) { user.turoJoinDate = turoJoinDate; changed = true; }
    if (getaroundJoinDate) { user.getaroundJoinDate = getaroundJoinDate; changed = true; }
    if (changed) await this.repo.save(user);
  }
}
