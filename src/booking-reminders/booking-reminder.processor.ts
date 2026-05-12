import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { Booking, CANCELLED_STATUSES } from '../bookings/booking.entity';
import { SmsService } from '../sms/sms.service';
import { ReminderLog, ReminderStatus } from './reminder-log.entity';
import { ReminderSettingsService } from './reminder-settings.service';
import {
  BOOKING_REMINDER_QUEUE,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_SMS_TEMPLATE,
} from './booking-reminders.constants';
import { NotificationSettings } from './notification-settings.entity';
import type { BookingReminderJobData } from './reminder-scheduler.service';

@Processor(BOOKING_REMINDER_QUEUE)
export class BookingReminderProcessor extends DlqAwareWorker {
  protected readonly queueName = BOOKING_REMINDER_QUEUE;
  private readonly logger = new Logger(BookingReminderProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    private readonly settingsService: ReminderSettingsService,
    private readonly smsService: SmsService,
  ) {
    super(dlqService);
  }

  async process(job: Job<BookingReminderJobData>): Promise<void> {
    const { bookingId, logId } = job.data;
    this.logger.log(`Processing reminder for booking ${bookingId}`);

    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log || log.status === ReminderStatus.CANCELLED) {
      this.logger.log(`Reminder log ${logId} cancelled or missing — skipping`);
      return;
    }

    await this.logRepo.update(logId, { attemptCount: (log.attemptCount ?? 0) + 1 });

    const settings = await this.settingsService.getSettings();

    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['car', 'user'],
    });

    if (!booking) {
      await this.logRepo.update(logId, { status: ReminderStatus.SKIPPED, errorMessage: 'Booking not found' });
      return;
    }

    if (CANCELLED_STATUSES.includes(booking.status as typeof CANCELLED_STATUSES[number])) {
      await this.logRepo.update(logId, {
        status:       ReminderStatus.SKIPPED,
        errorMessage: `Booking is ${booking.status}`,
      });
      return;
    }

    const vars = this.buildTemplateVars(booking, settings.reminderMinutesBefore);

    // ── SMS ──────────────────────────────────────────────────────────────────
    const smsUpdate = await this.sendSms(settings, vars);

    // ── Email ─────────────────────────────────────────────────────────────────
    const emailUpdate = await this.sendEmail(settings, vars);

    // ── Overall status ────────────────────────────────────────────────────────
    const anySent   = smsUpdate.smsStatus === 'sent'   || emailUpdate.emailStatus === 'sent';
    const anyFailed = smsUpdate.smsStatus === 'failed' || emailUpdate.emailStatus === 'failed';
    const nothingConfigured =
      (!settings.enabled    || settings.recipientPhones.length === 0) &&
      (!settings.emailEnabled || settings.recipientEmails.length === 0);

    const overallStatus =
      nothingConfigured ? ReminderStatus.SKIPPED :
      anySent           ? ReminderStatus.SENT    :
      anyFailed         ? ReminderStatus.FAILED  :
      ReminderStatus.SKIPPED;

    await this.logRepo.update(logId, {
      status:  overallStatus,
      sentAt:  anySent ? new Date() : undefined,
      ...smsUpdate,
      ...emailUpdate,
    });

    this.logger.log(
      `Reminder for booking ${bookingId}: SMS=${smsUpdate.smsStatus ?? 'n/a'} Email=${emailUpdate.emailStatus ?? 'n/a'}`,
    );
  }

  // ── SMS ───────────────────────────────────────────────────────────────────

  private async sendSms(
    settings: NotificationSettings,
    vars: Record<string, string>,
  ): Promise<Partial<ReminderLog>> {
    if (!settings.enabled) return { smsStatus: 'skipped' };
    if (settings.recipientPhones.length === 0) return { smsStatus: 'skipped' };

    const message = this.settingsService.renderTemplate(
      settings.smsTemplate ?? DEFAULT_SMS_TEMPLATE,
      vars,
    );

    try {
      for (const phone of settings.recipientPhones) {
        await this.smsService.addMessage(phone, message);
      }
      return {
        smsStatus:      'sent',
        recipientPhone: settings.recipientPhones.join(', '),
        messageBody:    message,
      };
    } catch (err) {
      return { smsStatus: 'failed', smsError: (err as Error)?.message };
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────

  private async sendEmail(
    settings: NotificationSettings,
    vars: Record<string, string>,
  ): Promise<Partial<ReminderLog>> {
    if (!settings.emailEnabled) return { emailStatus: 'skipped' };
    if (settings.recipientEmails.length === 0) return { emailStatus: 'skipped' };

    if (!process.env.SMTP_HOST) {
      this.logger.warn('[REMINDER] SMTP not configured — email skipped');
      return { emailStatus: 'skipped' };
    }

    const subject = this.settingsService.renderTemplate(
      settings.emailSubject ?? DEFAULT_EMAIL_SUBJECT,
      vars,
    );
    const bodyText = this.settingsService.renderTemplate(
      settings.emailTemplate ?? DEFAULT_EMAIL_TEMPLATE,
      vars,
    );
    const html = this.wrapEmailHtml(bodyText);

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer') as typeof import('nodemailer');
      const transport  = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth:   process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
          : undefined,
      });

      const from = process.env.SMTP_FROM ?? 'noreply@vitecamion.com';
      for (const to of settings.recipientEmails) {
        await transport.sendMail({ from, to, subject, html });
      }

      return {
        emailStatus:    'sent',
        recipientEmail: settings.recipientEmails.join(', '),
      };
    } catch (err) {
      this.logger.error(`Reminder email failed: ${(err as Error)?.message}`);
      return { emailStatus: 'failed', emailError: (err as Error)?.message };
    }
  }

  private wrapEmailHtml(body: string): string {
    const escaped = body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.7; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 28px 24px; }
  .header { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
            color: #64748b; margin-bottom: 16px; }
  .body { background: #f8fafc; border-radius: 8px; padding: 20px 24px; }
  .footer { margin-top: 20px; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">Rappel automatique · vitecamion</div>
  <div class="body">${escaped}</div>
  <div class="footer">Ce message est envoyé automatiquement — ne pas répondre.</div>
</div>
</body></html>`;
  }

  // ── Template vars ─────────────────────────────────────────────────────────

  private buildTemplateVars(booking: Booking, minutesBefore: number): Record<string, string> {
    const fmt = (d: Date) =>
      d.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Paris',
      });

    const car  = booking.car;
    const user = booking.user;

    const carDetails =
      [car?.brand, car?.model, car?.name].filter(Boolean).join(' ') ||
      (car?.name ?? 'Véhicule inconnu');

    const location = booking.deliveryAddress ?? car?.parkingAddress ?? '';

    return {
      minutesBefore:  String(minutesBefore),
      customerName:   user?.name  ?? 'Client inconnu',
      customerPhone:  user?.phone ?? '',
      carDetails,
      carBrand:       car?.brand ?? '',
      carModel:       car?.model ?? '',
      carName:        car?.name  ?? '',
      source:         booking.source,
      startDateTime:  fmt(booking.startDateTime),
      endDateTime:    fmt(booking.endDateTime),
      location,
      totalPrice:     Number(booking.totalPrice).toFixed(2),
      reservationId:  booking.reservationNumber ?? booking.id.slice(0, 8).toUpperCase(),
      bookingId:      booking.id,
    };
  }
}
