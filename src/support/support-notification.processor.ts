import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { SmsService } from '../sms/sms.service';
import { SupportConversation } from './entities/support-conversation.entity';
import { SupportNotificationLog } from './entities/support-notification-log.entity';
import { SupportNotificationService } from './support-notification.service';
import { SUPPORT_QUEUE } from './support.constants';

@Processor(SUPPORT_QUEUE)
export class SupportNotificationProcessor extends DlqAwareWorker {
  protected readonly queueName = SUPPORT_QUEUE;
  private readonly logger = new Logger(SupportNotificationProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(SupportConversation)
    private readonly convRepo: Repository<SupportConversation>,
    @InjectRepository(SupportNotificationLog)
    private readonly logRepo: Repository<SupportNotificationLog>,
    private readonly notifService: SupportNotificationService,
    private readonly smsService: SmsService,
  ) {
    super(dlqService);
  }

  async process(job: Job<{ conversationId: string }>): Promise<void> {
    const { conversationId } = job.data;

    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) return;

    const settings = await this.notifService.getSettings();

    // Debounce: skip if notified within cooldown window
    if (conv.lastNotifiedAt) {
      const cooldownMs = settings.smsCooldownMin * 60_000;
      if (Date.now() - conv.lastNotifiedAt.getTime() < cooldownMs) {
        this.logger.log(`Support notif skipped (cooldown) conv=${conversationId}`);
        await this.log(conversationId, 'skipped');
        return;
      }
    }

    if (!settings.smsEnabled || settings.smsPhones.length === 0) {
      await this.log(conversationId, 'skipped', undefined, { reason: 'disabled_or_no_phones' });
      return;
    }

    const message =
      `[Support] Nouveau message client\n` +
      `${conv.guestName ? `De: ${conv.guestName}\n` : ''}` +
      `Conv: ${conversationId.slice(0, 8).toUpperCase()}\n` +
      `/admin/support`;

    try {
      for (const phone of settings.smsPhones) {
        await this.smsService.addMessage(phone, message);
      }
      await this.convRepo.update(conversationId, { lastNotifiedAt: new Date() });
      await this.log(conversationId, 'sent', undefined, { phones: settings.smsPhones });
      this.logger.log(`Support SMS sent conv=${conversationId}`);
    } catch (err) {
      const error = (err as Error).message;
      await this.log(conversationId, 'failed', error);
      throw err; // triggers BullMQ retry
    }
  }

  private async log(
    conversationId: string,
    status: string,
    providerResponse?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        conversationId,
        notificationType: 'sms',
        status,
        providerResponse: providerResponse ?? null,
        metadata: metadata ?? null,
      }),
    );
  }
}
