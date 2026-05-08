import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRentPositionDto } from './dto/create-rent-position.dto';
import { CreateRentSessionDto } from './dto/create-rent-session.dto';
import { PatchRentSessionDto } from './dto/patch-rent-session.dto';
import { extractLatLng, extractMapsUrl, haversineKm } from '../common/utils/map.util';
import { RentPosition } from './rent-position.entity';
import { RentSession, RentSessionStatus } from './rent-session.entity';

const LOCATION_INTERVAL_MS = 15 * 60 * 1000;
const MAX_POSITION_JUMP_KM = 100;

export function addLocationInterval(from: Date): Date {
  return new Date(from.getTime() + LOCATION_INTERVAL_MS);
}

@Injectable()
export class RentSessionsService {
  private readonly logger = new Logger(RentSessionsService.name);

  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(RentPosition)
    private readonly positionRepo: Repository<RentPosition>,
  ) {}

  async create(dto: CreateRentSessionDto): Promise<RentSession> {
    if (dto.bookingId) {
      const existing = await this.sessionRepo.findOne({ where: { bookingId: dto.bookingId } });
      if (existing) throw new ConflictException('This booking already has a rent session');
    }
    const now = new Date();
    return this.sessionRepo.save(
      this.sessionRepo.create({
        carId: dto.carId,
        bookingId: dto.bookingId ?? null,
        trackingPaused: false,
        nextLocationAt: addLocationInterval(now),
      }),
    );
  }

  findAllForCar(carId: string): Promise<RentSession[]> {
    return this.sessionRepo.find({
      where: { carId },
      relations: { positions: true, booking: { user: true } },
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
      // Allow stopping tracking on an ended manual-GPS session
      if (dto.trackingPaused === true) {
        await this.sessionRepo.update(id, { trackingPaused: true, nextLocationAt: null });
        return this.findOne(id);
      }
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
    await this.sessionRepo.delete(id);
  }

  async addPosition(
    id: string,
    dto: CreateRentPositionDto,
  ): Promise<RentPosition | null> {
    await this.findOne(id);

    // Fetch a small history window to detect positional consistency.
    const recent = await this.positionRepo.find({
      where: { sessionId: id },
      order: { recordedAt: 'DESC' },
      take: 5,
    });

    // Bootstrap phase ends dynamically — not after an arbitrary fixed count,
    // but as soon as at least one pair of consecutive stored fixes are within
    // the jump limit of each other. Until a stable cluster forms we accept
    // every point unconditionally so a slow GPS cold-start or early scatter
    // doesn't trigger false rejections.
    //
    // Once consensus exists, a new fix is accepted if it is within
    // MAX_POSITION_JUMP_KM of ANY stored fix. That prevents a single rogue
    // fix (already stored) from poisoning subsequent valid positions.
    const hasConsensus = recent.slice(0, -1).some((r, i) =>
      haversineKm(
        Number(r.lat), Number(r.lng),
        Number(recent[i + 1].lat), Number(recent[i + 1].lng),
      ) <= MAX_POSITION_JUMP_KM,
    );

    if (hasConsensus) {
      const closeToAny = recent.some(r =>
        haversineKm(Number(r.lat), Number(r.lng), dto.lat, dto.lng) <= MAX_POSITION_JUMP_KM,
      );
      if (!closeToAny) {
        const dists = recent.map(r =>
          haversineKm(Number(r.lat), Number(r.lng), dto.lat, dto.lng).toFixed(1),
        );
        this.logger.warn(
          `Position discarded for session ${id}: ` +
          `${MAX_POSITION_JUMP_KM} km limit exceeded against all ${recent.length} recent fixes ` +
          `(distances: ${dists.join(', ')} km, new ${dto.lat},${dto.lng})`,
        );
        return null;
      }
    }

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

  private findTrackingSessionByCarPhone(phoneNumber: string): Promise<RentSession | null> {
    // Matches both active sessions and ended sessions still tracking (manual GPS mode)
    return this.sessionRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.car', 'car')
      .leftJoin('s.booking', 'booking')
      .where('car.phoneNumber = :phoneNumber', { phoneNumber })
      .andWhere('s.trackingPaused = false')
      .andWhere(
        '(s.status = :active OR (s.status = :ended AND booking.gpsStopMode = :manual))',
        { active: RentSessionStatus.ACTIVE, ended: RentSessionStatus.ENDED, manual: 'manual' },
      )
      .orderBy('s.startedAt', 'DESC')
      .getOne();
  }

  async processInboundSms(phoneNumber: string, message: string, receivedAt: Date): Promise<void> {
    const session = await this.findTrackingSessionByCarPhone(phoneNumber);
    if (!session) return;
    if (session.trackingPaused) return;
    if (!session.lastLocationRequestedAt) return;
    if (receivedAt <= session.lastLocationRequestedAt) return;

    const mapsUrl = extractMapsUrl(message);
    if (!mapsUrl) return;

    const coords = extractLatLng(mapsUrl);
    if (!coords) return;

    await this.addPosition(session.id, {
      lat: coords.lat,
      lng: coords.lng,
      rawMessage: message,
      recordedAt: receivedAt,
    });
  }
}
