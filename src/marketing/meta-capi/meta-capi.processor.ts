import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqAwareWorker } from '../../dlq/dlq-aware.worker';
import { DlqService } from '../../dlq/dlq.service';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import {
  META_CAPI_QUEUE,
  MetaCapiPurchaseJobData,
} from './meta-capi.constants';

/**
 * Sends the Purchase event to Meta's Conversions API. Only value/currency/content
 * identifiers + a pre-hashed email are ever sent (see meta-capi-order.listener.ts) —
 * do not add name, phone, address, or any other customer data here without legal
 * review; Meta's Business Tools Terms prohibit sending health, financial, or
 * children's data through Pixel/CAPI.
 *
 * Unlike TurnstileService (which fails open on network errors to avoid blocking
 * real users on a security gate), a failed CAPI call throws so BullMQ's
 * retry/backoff and DlqAwareWorker's dead-letter handling can take over — losing
 * an analytics event is fine to retry, never fine to silently drop without a trace.
 */
@Processor(META_CAPI_QUEUE)
export class MetaCapiProcessor extends DlqAwareWorker {
  protected readonly queueName = META_CAPI_QUEUE;
  private readonly logger = new Logger(MetaCapiProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly settings: PlatformSettingsService,
  ) {
    super(dlqService);
  }

  async process(job: Job<MetaCapiPurchaseJobData>): Promise<void> {
    const { pixelId } = this.settings.getMetaPixelConfig();
    const token = process.env.META_CAPI_ACCESS_TOKEN;
    if (!pixelId || !token) {
      this.logger.warn(
        'Meta CAPI job skipped: pixel ID or access token not configured',
      );
      return;
    }

    const version = process.env.META_CAPI_API_VERSION || 'v21.0';
    const data = job.data;

    // client_ip_address / client_user_agent / fbc / fbp are sent as-is, never
    // hashed — only fields like email/phone/name get SHA-256'd per Meta's spec.
    const userData: Record<string, unknown> = { em: [data.customerEmailHash] };
    if (data.clientIpAddress) userData.client_ip_address = data.clientIpAddress;
    if (data.clientUserAgent) userData.client_user_agent = data.clientUserAgent;
    if (data.fbc) userData.fbc = data.fbc;
    if (data.fbp) userData.fbp = data.fbp;

    const body = {
      data: [
        {
          event_name: 'Purchase',
          event_time: data.eventTime,
          event_id: data.eventId,
          action_source: 'website',
          event_source_url: data.eventSourceUrl,
          user_data: userData,
          custom_data: {
            value: data.valueEur,
            currency: 'EUR',
            content_type: 'product',
            content_ids: data.contentIds,
            contents: data.contents,
          },
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Meta CAPI request failed (${res.status}): ${errBody}`);
    }
  }
}
