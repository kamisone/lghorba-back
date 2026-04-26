import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RentSchedule } from '../cars/rent-schedule.entity';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(RentSchedule)
    private readonly scheduleRepo: Repository<RentSchedule>,
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
  ) {}

  async findAll(search?: string, limit = 20): Promise<(User & { rentCount: number })[]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .loadRelationCountAndMap('u.rentCount', 'u.rentSchedules')
      .orderBy('u.createdAt', 'DESC')
      .take(limit);
    if (search) {
      qb.where('u.name ILIKE :s OR u.phone ILIKE :s', { s: `%${search}%` });
    }
    return qb.getMany() as Promise<(User & { rentCount: number })[]>;
  }

  async create(dto: CreateUserDto): Promise<User> {
    return this.repo.save(
      this.repo.create({
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        score: dto.score ?? null,
        turoJoinDate: dto.turoJoinDate ?? null,
        getaroundJoinDate: dto.getaroundJoinDate ?? null,
      }),
    );
  }

  async findOne(id: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const [rentCount, sessions] = await Promise.all([
      this.scheduleRepo.count({ where: { userId: id } }),
      this.sessionRepo
        .createQueryBuilder('s')
        .innerJoinAndSelect('s.schedule', 'sch')
        .innerJoinAndSelect('sch.car', 'car')
        .where('sch.userId = :userId', { userId: id })
        .getMany(),
    ]);

    const rentSessions = sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      status: s.status,
      schedule: s.schedule
        ? {
            id: s.schedule.id,
            fromDate: s.schedule.fromDate,
            toDate: s.schedule.toDate,
            car: (s.schedule as any).car
              ? {
                  id: (s.schedule as any).car.id,
                  name: (s.schedule as any).car.name,
                  immatriculation: (s.schedule as any).car.immatriculation,
                }
              : null,
          }
        : null,
    }));

    return { ...user, rentCount, rentSessions };
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
