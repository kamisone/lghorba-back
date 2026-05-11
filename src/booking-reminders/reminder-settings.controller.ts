import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { ReminderLog, ReminderStatus } from './reminder-log.entity';
import { ReminderSettingsService, UpdateReminderSettingsDto } from './reminder-settings.service';
import { DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_TEMPLATE, DEFAULT_SMS_TEMPLATE } from './booking-reminders.constants';

const SAMPLE_VARS: Record<string, string> = {
  minutesBefore: '60',
  customerName:  'Jean Dupont',
  customerPhone: '+33 6 12 34 56 78',
  carDetails:    'Renault Kangoo VU',
  carBrand:      'Renault',
  carModel:      'Kangoo',
  carName:       'Kangoo VU',
  source:        'turo',
  startDateTime: '01/06/2025 09:00',
  endDateTime:   '05/06/2025 18:00',
  location:      '12 Rue de la Paix, Paris',
  totalPrice:    '320.00',
  reservationId: 'RES-001',
  bookingId:     'abc12345',
};

@Controller('admin/reminders')
export class ReminderSettingsController {
  constructor(
    private readonly settingsService: ReminderSettingsService,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
  ) {}

  @Get('settings')
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Put('settings')
  async updateSettings(@Body() dto: UpdateReminderSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Post('preview')
  async previewTemplate(@Body() body: {
    template?: string;
    subject?: string;
    vars?: Record<string, string>;
  }) {
    const vars: Record<string, string> = body.vars ?? SAMPLE_VARS;
    return {
      preview: this.settingsService.renderTemplate(body.template ?? DEFAULT_SMS_TEMPLATE, vars),
      subject: body.subject
        ? this.settingsService.renderTemplate(body.subject, vars)
        : this.settingsService.renderTemplate(DEFAULT_EMAIL_SUBJECT, vars),
    };
  }

  @Get('defaults')
  getDefaults() {
    return {
      smsTemplate:   DEFAULT_SMS_TEMPLATE,
      emailSubject:  DEFAULT_EMAIL_SUBJECT,
      emailTemplate: DEFAULT_EMAIL_TEMPLATE,
    };
  }

  @Get('logs')
  async getLogs(
    @Query('page')   page   = '1',
    @Query('limit')  limit  = '20',
    @Query('status') status?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where: FindManyOptions<ReminderLog>['where'] =
      status ? { status: status as ReminderStatus } : {};

    const [items, total] = await this.logRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total, page: Number(page), limit: take };
  }
}
