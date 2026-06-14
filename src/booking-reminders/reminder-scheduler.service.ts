import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { BookingStatus, CANCELLED_STATUSES } from '../bookings/booking.entity';
import { ReminderLog, ReminderStatus, ReminderType } from './reminder-log.entity';
import { ReminderSettingsService } from './reminder-settings.service';
import { BOOKING_REMINDER_QUEUE } from './booking-reminders.constants';

export interface SchedulableBooking {
  id: string;
  startDateTime: Date;
  endDateTime: Date;
  status: BookingStatus;
}

export interface BookingReminderJobData {
  bookingId: string;
  logId: string;
}

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectQueue(BOOKING_REMINDER_QUEUE)
    private readonly queue: Queue<BookingReminderJobData>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    private readonly settingsService: ReminderSettingsService,
  ) {}

  async scheduleReminder(booking: SchedulableBooking): Promise<void> {
    const settings = await this.settingsService.getSettings();

    if (!settings.enabled && !settings.emailEnabled) return;
    if (CANCELLED_STATUSES.includes(booking.status as typeof CANCELLED_STATUSES[number])) return;

    await this.cancelReminder(booking.id);

    await this.scheduleOne(booking, ReminderType.PICKUP, booking.startDateTime, settings.reminderMinutesBefore);
    await this.scheduleOne(booking, ReminderType.RETURN, booking.endDateTime, settings.reminderMinutesBefore);
  }

  private async scheduleOne(
    booking: SchedulableBooking,
    type: ReminderType,
    targetDateTime: Date,
    minutesBefore: number,
  ): Promise<void> {
    const fireAt = new Date(targetDateTime.getTime() - minutesBefore * 60_000);
    const delay = fireAt.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.debug(`${type} reminder for booking ${booking.id} is in the past — skipping`);
      return;
    }

    const log = await this.logRepo.save(
      this.logRepo.create({
        bookingId:    booking.id,
        type,
        scheduledFor: fireAt,
        status:       ReminderStatus.SCHEDULED,
      }),
    );

    const jobId = `reminder-${booking.id}-${type}`;
    const job = await this.queue.add(
      'send-reminder',
      { bookingId: booking.id, logId: log.id },
      {
        delay,
        jobId,
        removeOnComplete: true,
        removeOnFail:     false,
        attempts:         3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    await this.logRepo.update(log.id, { bullJobId: job.id });
    this.logger.log(
      `${type} reminder scheduled for booking ${booking.id} at ${fireAt.toISOString()} (delay ${delay}ms)`,
    );
  }

  async cancelReminder(bookingId: string): Promise<void> {
    for (const jobId of [
      `reminder-${bookingId}-${ReminderType.PICKUP}`,
      `reminder-${bookingId}-${ReminderType.RETURN}`,
      `reminder-${bookingId}`, // legacy job id (pre pickup/return split)
    ]) {
      try {
        const job = await this.queue.getJob(jobId);
        if (job) await job.remove();
      } catch (err) {
        this.logger.warn(`Could not remove job ${jobId}: ${(err as Error)?.message}`);
      }
    }

    await this.logRepo.update(
      { bookingId, status: ReminderStatus.SCHEDULED },
      { status: ReminderStatus.CANCELLED },
    );
  }

  async rescheduleReminder(booking: SchedulableBooking): Promise<void> {
    await this.cancelReminder(booking.id);
    await this.scheduleReminder(booking);
  }
}
