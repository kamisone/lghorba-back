import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Car } from '../cars/car.entity';
import { RentSchedule } from '../cars/rent-schedule.entity';
import { SmsService } from '../sms/sms.service';
import { addLocationInterval } from './rent-sessions.service';
import { RentSession, RentSessionStatus } from './rent-session.entity';

@Injectable()
export class RentSessionsTasksService {
  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(RentSchedule)
    private readonly scheduleRepo: Repository<RentSchedule>,
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    private readonly smsService: SmsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendLocationRequests(): Promise<void> {
    const now = new Date();
    const sessions = await this.sessionRepo.find({
      where: { status: RentSessionStatus.ACTIVE, nextLocationAt: LessThanOrEqual(now) },
      relations: { car: true },
    });
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
    const schedules = await this.scheduleRepo.find({
      where: { fromDate: LessThanOrEqual(now), autoStartTracking: true },
    });
    await Promise.all(
      schedules.map(async (schedule) => {
        const existing = await this.sessionRepo.findOne({
          where: {
            scheduleId: schedule.id,
            status: In([RentSessionStatus.ACTIVE, RentSessionStatus.PAUSED, RentSessionStatus.PENDING_STOP]),
          },
        });
        if (existing) return;
        const car = await this.carRepo.findOne({ where: { id: schedule.carId } });
        if (!car) return;
        const ts = new Date();
        await this.sessionRepo.save(
          this.sessionRepo.create({
            carId: schedule.carId,
            scheduleId: schedule.id,
            nextLocationAt: addLocationInterval(ts),
          }),
        );
        await this.smsService.addMessage(car.phoneNumber, 'location');
      }),
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async endExpiredScheduledSessions(): Promise<void> {
    const now = new Date();
    const sessions = await this.sessionRepo
      .createQueryBuilder('session')
      .innerJoin('session.schedule', 'schedule')
      .where('session.status IN (:...statuses)', {
        statuses: [RentSessionStatus.ACTIVE, RentSessionStatus.PAUSED, RentSessionStatus.PENDING_STOP],
      })
      .andWhere('schedule.toDate < :now', { now })
      .getMany();

    if (sessions.length === 0) return;
    await this.sessionRepo.update(
      sessions.map((s) => s.id),
      { status: RentSessionStatus.ENDED, endedAt: now },
    );
  }
}
