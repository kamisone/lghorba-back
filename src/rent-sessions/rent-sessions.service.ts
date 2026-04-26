import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RentSchedule } from '../cars/rent-schedule.entity';
import { CreateRentPositionDto } from './dto/create-rent-position.dto';
import { CreateRentSessionDto } from './dto/create-rent-session.dto';
import { PatchRentSessionDto } from './dto/patch-rent-session.dto';
import { extractLatLng, extractMapsUrl } from './map-utils';
import { RentPosition } from './rent-position.entity';
import { RentSession, RentSessionStatus } from './rent-session.entity';

const LOCATION_INTERVAL_MS = 15 * 60 * 1000;

export function addLocationInterval(from: Date): Date {
  return new Date(from.getTime() + LOCATION_INTERVAL_MS);
}

@Injectable()
export class RentSessionsService {
  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(RentPosition)
    private readonly positionRepo: Repository<RentPosition>,
    @InjectRepository(RentSchedule)
    private readonly scheduleRepo: Repository<RentSchedule>,
  ) {}

  async create(dto: CreateRentSessionDto): Promise<RentSession> {
    if (dto.scheduleId) {
      const existing = await this.sessionRepo.findOne({ where: { scheduleId: dto.scheduleId } });
      if (existing) throw new ConflictException('This schedule already has a rent session');
    }
    const now = new Date();
    return this.sessionRepo.save(
      this.sessionRepo.create({
        carId: dto.carId,
        scheduleId: dto.scheduleId ?? null,
        trackingPaused: false,
        nextLocationAt: addLocationInterval(now),
      }),
    );
  }

  findAllForCar(carId: string): Promise<RentSession[]> {
    return this.sessionRepo.find({
      where: { carId },
      relations: { positions: true, schedule: { user: true } },
      order: { startedAt: 'DESC', positions: { recordedAt: 'ASC' } },
    });
  }

  async findUnlinked(): Promise<{ id: string; startedAt: Date; endedAt: Date | null; status: RentSessionStatus; car: { id: string; name: string; immatriculation: string } | null }[]> {
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.car', 'car')
      .where('s.userId IS NULL')
      .orderBy('s.startedAt', 'DESC')
      .getMany();
    return sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      status: s.status,
      car: s.car ? { id: s.car.id, name: s.car.name, immatriculation: s.car.immatriculation } : null,
    }));
  }

  async findOne(id: string): Promise<RentSession> {
    const session = await this.sessionRepo.findOne({
      where: { id },
      relations: { positions: true },
      order: { positions: { recordedAt: 'ASC' } },
    });
    if (!session) throw new NotFoundException(`RentSession ${id} not found`);
    return session;
  }

  async patch(id: string, dto: PatchRentSessionDto): Promise<RentSession> {
    const session = await this.findOne(id);
    if (session.status === RentSessionStatus.ENDED) {
      throw new BadRequestException('Cannot update an ended session');
    }
    const update: Partial<RentSession> = {};
    if (dto.status) {
      update.status = dto.status;
      if (dto.status === RentSessionStatus.ENDED) {
        update.endedAt = new Date();
        update.nextLocationAt = null;
        update.trackingPaused = false;
      }
    }
    if (dto.trackingPaused !== undefined) {
      update.trackingPaused = dto.trackingPaused;
      update.nextLocationAt = dto.trackingPaused
        ? null
        : addLocationInterval(new Date());
    }
    if (dto.lastLocationRequestedAt) {
      const ts = new Date(dto.lastLocationRequestedAt);
      update.lastLocationRequestedAt = ts;
      update.nextLocationAt = addLocationInterval(ts);
    }
    await this.sessionRepo.update(id, update);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const session = await this.findOne(id);
    if (session.status !== RentSessionStatus.ENDED) {
      throw new BadRequestException('Cannot delete an active session');
    }
    if (session.scheduleId) {
      await this.scheduleRepo.delete(session.scheduleId);
    } else {
      await this.sessionRepo.delete(id);
    }
  }

  async addPosition(
    id: string,
    dto: CreateRentPositionDto,
  ): Promise<RentPosition> {
    await this.findOne(id);
    return this.positionRepo.save(
      this.positionRepo.create({ ...dto, sessionId: id }),
    );
  }

  async getPositions(id: string): Promise<RentPosition[]> {
    await this.findOne(id);
    return this.positionRepo.find({
      where: { sessionId: id },
      order: { recordedAt: 'ASC' },
    });
  }

  private findActiveSessionByCarPhone(phoneNumber: string): Promise<RentSession | null> {
    return this.sessionRepo.findOne({
      where: { status: RentSessionStatus.ACTIVE, car: { phoneNumber } },
      relations: { car: true },
    });
  }

  async processInboundSms(phoneNumber: string, message: string, receivedAt: Date): Promise<void> {
    const session = await this.findActiveSessionByCarPhone(phoneNumber);
    if (!session) return;
    if (session.trackingPaused) return;
    if (!session.lastLocationRequestedAt) return;
    if (receivedAt <= session.lastLocationRequestedAt) return;

    const mapsUrl = extractMapsUrl(message);
    if (!mapsUrl) return;

    const coords = extractLatLng(mapsUrl);
    if (!coords) return;

    if (coords.lat % 1 === 0 || coords.lng % 1 === 0) {
      const last = await this.positionRepo.findOne({
        where: { sessionId: session.id },
        order: { recordedAt: 'DESC' },
      });
      if (!last) return;
      await this.positionRepo.save(
        this.positionRepo.create({
          sessionId: session.id,
          lat: last.lat,
          lng: last.lng,
          rawMessage: message,
          recordedAt: receivedAt,
        }),
      );
      return;
    }

    await this.addPosition(session.id, {
      lat: coords.lat,
      lng: coords.lng,
      rawMessage: message,
      recordedAt: receivedAt,
    });
  }
}
