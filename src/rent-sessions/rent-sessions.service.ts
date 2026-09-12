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
import { extractLatLng, extractMapsUrl } from '../common/utils/map.util';
import { Booking, BookingSource } from '../bookings/booking.entity';
import {
  filterPosition,
  FilterResult,
  PositionFilterConfig,
  TRACKING_INTERVAL_HOURS,
} from './position-filter';
import { loadPositionFilterConfig } from './position-filter.config';
import { RentPosition } from './rent-position.entity';
import { RentSession, RentSessionStatus } from './rent-session.entity';

const LOCATION_INTERVAL_MS = TRACKING_INTERVAL_HOURS * 60 * 60 * 1000;

export function addLocationInterval(from: Date): Date {
  return new Date(from.getTime() + LOCATION_INTERVAL_MS);
}

@Injectable()
export class RentSessionsService {
  private readonly logger = new Logger(RentSessionsService.name);
  private readonly filterConfig: PositionFilterConfig = loadPositionFilterConfig();

  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(RentPosition)
    private readonly positionRepo: Repository<RentPosition>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
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

  findAllForCar(carId: string, includeRejected = false): Promise<RentSession[]> {
    // The rejected condition must live in the JOIN ON clause, not in WHERE:
    // in WHERE it would drop sessions that have no accepted positions at all.
    return this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.positions', 'p', includeRejected ? undefined : 'p.rejected = false')
      .leftJoinAndSelect('s.booking', 'booking')
      .leftJoinAndSelect('booking.user', 'user')
      .where('s.carId = :carId', { carId })
      .orderBy('s.startedAt', 'DESC')
      .addOrderBy('p.recordedAt', 'ASC')
      .getMany();
  }

  async findUnlinked(): Promise<{
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    status: RentSessionStatus;
    car: { id: string; name: string; immatriculation: string } | null;
    booking: { id: string; source: BookingSource } | null;
  }[]> {
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.car', 'car')
      .leftJoinAndSelect('s.booking', 'booking')
      .where('s.userId IS NULL')
      .orderBy('s.startedAt', 'DESC')
      .getMany();
    return sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      status: s.status,
      car: s.car ? { id: s.car.id, name: s.car.name, immatriculation: s.car.immatriculation } : null,
      booking: s.booking ? { id: s.booking.id, source: s.booking.source } : null,
    }));
  }

  async findOne(id: string, includeRejected = false): Promise<RentSession> {
    // See findAllForCar: the condition belongs in the JOIN, not the WHERE, or a
    // session whose only position was rejected would 404.
    const session = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.positions', 'p', includeRejected ? undefined : 'p.rejected = false')
      .where('s.id = :id', { id })
      .orderBy('p.recordedAt', 'ASC')
      .getOne();
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
        const now = new Date();
        update.endedAt = now;
        update.nextLocationAt = null;
        update.trackingPaused = false;

        // Propagate early return to the booking so the frontend reflects the
        // actual end time instead of the originally scheduled one.
        if (session.bookingId) {
          const booking = await this.bookingRepo.findOne({ where: { id: session.bookingId } });
          if (booking && now < booking.endDateTime) {
            booking.endDateTime = now;
            await this.bookingRepo.save(booking);
          }
        }
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

  /**
   * Fetches the two references the plausibility filter compares against: the
   * last accepted position (the anchor) and the last rejected one (used to
   * corroborate a genuine relocation). Both hit the composite index.
   */
  private async runFilter(
    sessionId: string,
    dto: CreateRentPositionDto,
  ): Promise<{ result: FilterResult; anchor: RentPosition | null }> {
    const [anchor, lastRejected] = await Promise.all([
      this.positionRepo.findOne({
        where: { sessionId, rejected: false },
        order: { recordedAt: 'DESC' },
      }),
      this.positionRepo.findOne({
        where: { sessionId, rejected: true },
        order: { recordedAt: 'DESC' },
      }),
    ]);

    const result = filterPosition(
      { lat: dto.lat, lng: dto.lng, recordedAt: dto.recordedAt, rawMessage: dto.rawMessage },
      { anchor, lastRejected, now: new Date(), config: this.filterConfig },
    );
    return { result, anchor };
  }

  /**
   * @param opts.skipFilter bypass plausibility filtering. Set for authenticated
   * admin entry: a manual correction would otherwise fail the speed check
   * exactly when it is most needed — when fixing a bad anchor.
   */
  async addPosition(
    id: string,
    dto: CreateRentPositionDto,
    opts: { skipFilter?: boolean } = {},
  ): Promise<RentPosition | null> {
    const exists = await this.sessionRepo.exist({ where: { id } });
    if (!exists) throw new NotFoundException(`RentSession ${id} not found`);

    if (opts.skipFilter) {
      return this.positionRepo.save(
        this.positionRepo.create({ ...dto, sessionId: id, rejected: false }),
      );
    }

    const { result, anchor } = await this.runFilter(id, dto);

    // Retries carry no audit value and would otherwise accumulate.
    if (result.reason === 'duplicate') return null;

    if (!result.accepted) {
      // Anchor snapshot lets a rejection be diagnosed straight from the logs:
      // a plausible anchor with an implausible speed is a real threshold miss,
      // an anchor far from every subsequent reading is a poisoned anchor that
      // needs a manual correction (see addPosition's skipFilter admin path).
      const anchorInfo = anchor
        ? ` anchor=(${anchor.lat},${anchor.lng} @ ${anchor.recordedAt.toISOString()})`
        : '';
      this.logger.warn(
        `Rejected position for session ${id}: ${result.reason}` +
          (result.impliedSpeedKmh !== undefined
            ? ` (impliedSpeedKmh=${result.impliedSpeedKmh.toFixed(1)})`
            : '') +
          ` candidate=(${dto.lat},${dto.lng} @ ${dto.recordedAt.toISOString()})` +
          anchorInfo,
      );
    }

    const saved = await this.positionRepo.save(
      this.positionRepo.create({
        ...dto,
        sessionId: id,
        rejected: !result.accepted,
        rejectReason: result.reason ?? null,
        impliedSpeedKmh: result.impliedSpeedKmh ?? null,
      }),
    );

    // A second reading corroborated an earlier rejection: the car really did move.
    if (result.unrejectPositionId) {
      await this.positionRepo.update(result.unrejectPositionId, {
        rejected: false,
        rejectReason: null,
      });
    }

    return saved;
  }

  async removePosition(sessionId: string, positionId: string): Promise<void> {
    const position = await this.positionRepo.findOne({ where: { id: positionId } });
    if (!position || position.sessionId !== sessionId) {
      throw new NotFoundException(`Position ${positionId} not found for session ${sessionId}`);
    }
    await this.positionRepo.delete(positionId);
  }

  async getPositions(id: string, includeRejected = false): Promise<RentPosition[]> {
    const exists = await this.sessionRepo.exist({ where: { id } });
    if (!exists) throw new NotFoundException(`RentSession ${id} not found`);
    return this.positionRepo.find({
      where: includeRejected ? { sessionId: id } : { sessionId: id, rejected: false },
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
