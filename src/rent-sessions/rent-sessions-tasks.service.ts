import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking, CANCELLED_STATUSES } from '../bookings/booking.entity';
import { Car } from '../cars/car.entity';
import { SmsService } from '../sms/sms.service';
import { addLocationInterval } from './rent-sessions.service';
import { RentSession, RentSessionStatus } from './rent-session.entity';

@Injectable()
export class RentSessionsTasksService {
  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    private readonly smsService: SmsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendLocationRequests(): Promise<void> {
    const now = new Date();
    // Include ended sessions whose booking has gpsStopMode = 'manual' and
    // tracking has not yet been paused — the admin must explicitly stop it.
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.car', 'car')
      .leftJoin('s.booking', 'booking')
      .where('s.trackingPaused = :paused', { paused: false })
      .andWhere('s.nextLocationAt <= :now', { now })
      .andWhere(
        '(s.status = :active OR (s.status = :ended AND booking.gpsStopMode = :manual))',
        { active: RentSessionStatus.ACTIVE, ended: RentSessionStatus.ENDED, manual: 'manual' },
      )
      .getMany();

    await Promise.all(
      sessions.map(async (session) => {
        await this.smsService.addMessage(session.car.phoneNumber, 'location');
        const ts = new Date();
        await this.sessionRepo.update(session.id, {
          lastLocationRequestedAt: ts,
          nextLocationAt: addLocationInterval(ts),
        });
      }),
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async activateScheduledSessions(): Promise<void> {
    const now = new Date();
    // Start a session for every booking whose window is active and has no session yet.
    // autoStartTracking only controls whether GPS pings begin immediately; the session
    // is always created so the admin can see it and start tracking manually if needed.
    const bookings = await this.bookingRepo
      .createQueryBuilder('b')
      .where('b.status NOT IN (:...cancelledStatuses)', { cancelledStatuses: CANCELLED_STATUSES })
      .andWhere('b.startDateTime <= :now', { now })
      .andWhere('b.endDateTime > :now', { now })
      .getMany();

    if (bookings.length === 0) return;

    // Batch the "does this booking already have a session?" / "does its car
    // still exist?" lookups instead of two round trips per booking — this
    // cron runs every minute, so a per-row Promise.all here scales query
    // count with the number of concurrently active bookings.
    const [existingSessions, cars] = await Promise.all([
      this.sessionRepo.find({ where: { bookingId: In(bookings.map((b) => b.id)) } }),
      this.carRepo.find({ where: { id: In([...new Set(bookings.map((b) => b.carId))]) } }),
    ]);
    const sessionedBookingIds = new Set(existingSessions.map((s) => s.bookingId));
    const carById = new Map(cars.map((c) => [c.id, c]));

    const toStart = bookings.filter((b) => !sessionedBookingIds.has(b.id) && carById.has(b.carId));
    if (toStart.length === 0) return;

    const ts = new Date();
    await this.sessionRepo.save(
      toStart.map((booking) => {
        const trackingPaused = !booking.autoStartTracking;
        return this.sessionRepo.create({
          carId: booking.carId,
          bookingId: booking.id,
          lastLocationRequestedAt: trackingPaused ? null : ts,
          nextLocationAt: trackingPaused ? null : addLocationInterval(ts),
          trackingPaused,
        });
      }),
    );

    await Promise.all(
      toStart
        .filter((b) => b.autoStartTracking)
        .map((b) => this.smsService.addMessage(carById.get(b.carId)!.phoneNumber, 'location')),
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async endExpiredScheduledSessions(): Promise<void> {
    const now = new Date();
    // End ALL expired sessions regardless of gpsStopMode.
    // For manual-mode bookings the session ends but sendLocationRequests keeps
    // pinging until the admin explicitly sets trackingPaused = true.
    const sessions = await this.sessionRepo
      .createQueryBuilder('session')
      .innerJoin('session.booking', 'booking')
      .where('session.status = :status', { status: RentSessionStatus.ACTIVE })
      .andWhere('booking.endDateTime < :now', { now })
      .getMany();

    if (sessions.length === 0) return;
    await this.sessionRepo.update(
      sessions.map((s) => s.id),
      { status: RentSessionStatus.ENDED, endedAt: now },
    );
  }
}
