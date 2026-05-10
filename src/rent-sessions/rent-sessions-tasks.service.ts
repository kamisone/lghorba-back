import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    // Find bookings with autoStartTracking that are currently active (started but not ended)
    // and don't yet have a session
    const bookings = await this.bookingRepo
      .createQueryBuilder('b')
      .where('b.autoStartTracking = true')
      .andWhere('b.status NOT IN (:...cancelledStatuses)', { cancelledStatuses: CANCELLED_STATUSES })
      .andWhere('b.startDateTime <= :now', { now })
      .andWhere('b.endDateTime > :now', { now })
      .getMany();

    await Promise.all(
      bookings.map(async (booking) => {
        const existing = await this.sessionRepo.findOne({ where: { bookingId: booking.id } });
        if (existing) return;
        const car = await this.carRepo.findOne({ where: { id: booking.carId } });
        if (!car) return;
        const ts = new Date();
        await this.sessionRepo.save(
          this.sessionRepo.create({
            carId: booking.carId,
            bookingId: booking.id,
            lastLocationRequestedAt: ts,
            nextLocationAt: addLocationInterval(ts),
            trackingPaused: false,
          }),
        );
        await this.smsService.addMessage(car.phoneNumber, 'location');
      }),
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
