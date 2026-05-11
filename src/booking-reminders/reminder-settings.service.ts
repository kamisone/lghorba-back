import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationSettings } from './notification-settings.entity';
import {
  BOOKING_REMINDER_SETTINGS_KEY,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_SMS_TEMPLATE,
} from './booking-reminders.constants';

export interface UpdateReminderSettingsDto {
  // SMS
  enabled?: boolean;
  reminderMinutesBefore?: number;
  recipientPhones?: string[];
  smsTemplate?: string;
  // Email
  emailEnabled?: boolean;
  recipientEmails?: string[];
  emailSubject?: string;
  emailTemplate?: string;
}

@Injectable()
export class ReminderSettingsService {
  private readonly logger = new Logger(ReminderSettingsService.name);

  constructor(
    @InjectRepository(NotificationSettings)
    private readonly repo: Repository<NotificationSettings>,
  ) {}

  async getSettings(): Promise<NotificationSettings> {
    let settings = await this.repo.findOne({
      where: { key: BOOKING_REMINDER_SETTINGS_KEY },
    });
    if (!settings) {
      settings = this.repo.create({
        key:                   BOOKING_REMINDER_SETTINGS_KEY,
        enabled:               true,
        reminderMinutesBefore: 60,
        recipientPhones:       [],
        smsTemplate:           DEFAULT_SMS_TEMPLATE,
        emailEnabled:          false,
        recipientEmails:       [],
        emailSubject:          DEFAULT_EMAIL_SUBJECT,
        emailTemplate:         DEFAULT_EMAIL_TEMPLATE,
      });
      await this.repo.save(settings);
      this.logger.log('Created default reminder settings');
    }
    return settings;
  }

  async updateSettings(dto: UpdateReminderSettingsDto): Promise<NotificationSettings> {
    const settings = await this.getSettings();
    if (dto.enabled               !== undefined) settings.enabled               = dto.enabled;
    if (dto.reminderMinutesBefore !== undefined) settings.reminderMinutesBefore = dto.reminderMinutesBefore;
    if (dto.recipientPhones       !== undefined) settings.recipientPhones       = dto.recipientPhones;
    if (dto.smsTemplate           !== undefined) settings.smsTemplate           = dto.smsTemplate;
    if (dto.emailEnabled          !== undefined) settings.emailEnabled          = dto.emailEnabled;
    if (dto.recipientEmails       !== undefined) settings.recipientEmails       = dto.recipientEmails;
    if (dto.emailSubject          !== undefined) settings.emailSubject          = dto.emailSubject;
    if (dto.emailTemplate         !== undefined) settings.emailTemplate         = dto.emailTemplate;
    return this.repo.save(settings);
  }

  renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
  }
}
