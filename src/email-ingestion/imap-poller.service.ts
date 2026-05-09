import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { simpleParser } from 'mailparser';
import { EmailIngestionService } from './email-ingestion.service';

// Known provider sender addresses — only these are fetched from the mailbox
const PROVIDER_SENDERS = [
  'noreply@mail.turo.com',
  'automated@mail-eu.getaround.com',
];

@Injectable()
export class ImapPollerService implements OnApplicationShutdown {
  private readonly logger = new Logger(ImapPollerService.name);
  private polling = false;

  // Lazy-imported to avoid top-level ESM issues
  private ImapFlow: typeof import('imapflow').ImapFlow | null = null;

  constructor(private readonly ingestionService: EmailIngestionService) {}

  async onApplicationShutdown(): Promise<void> {
    // nothing to clean up — connections are opened/closed per poll cycle
  }

  /** Polls every 5 minutes. Manual trigger available via admin endpoint. */
  @Cron('*/5 * * * *')
  async poll(): Promise<void> {
    if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
      this.logger.warn('IMAP not configured (IMAP_HOST / IMAP_USER / IMAP_PASSWORD missing)');
      return;
    }
    if (this.polling) {
      this.logger.debug('Poll already in progress, skipping');
      return;
    }
    this.polling = true;
    try {
      await this.runPoll();
    } catch (err) {
      this.logger.error(`IMAP poll failed: ${(err as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  private async runPoll(): Promise<void> {
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host:   process.env.IMAP_HOST ?? 'imap.gmail.com',
      port:   Number(process.env.IMAP_PORT ?? 993),
      secure: true,
      auth: {
        user: process.env.IMAP_USER!,
        pass: process.env.IMAP_PASSWORD!,
      },
      logger: false, // suppress imapflow internal logs
    });

    await client.connect();
    this.logger.log('IMAP connected');

    try {
      await client.mailboxOpen('INBOX');

      // Build search: unseen emails from known provider senders
      const searchCriteria: import('imapflow').SearchObject = {
        seen: false,
        or: PROVIDER_SENDERS.map(addr => ({ from: addr })) as any,
      };

      const rawUids = await client.search(searchCriteria, { uid: true });
      const uids: number[] = Array.isArray(rawUids) ? rawUids : [];
      this.logger.log(`Found ${uids.length} unread provider email(s)`);

      for (const uid of uids) {
        await this.processUid(client, String(uid));
      }
    } finally {
      await client.logout();
      this.logger.log('IMAP disconnected');
    }
  }

  private async processUid(
    client: import('imapflow').ImapFlow,
    uid: string,
  ): Promise<void> {
    try {
      const msgRaw = await client.fetchOne(
        uid,
        { source: true, flags: true },
        { uid: true },
      );
      const msg = msgRaw && typeof msgRaw === 'object' ? msgRaw as import('imapflow').FetchMessageObject : null;

      if (!msg || !('source' in msg) || !msg.source) {
        this.logger.warn(`Empty source for UID ${uid}`);
        return;
      }

      this.logger.log(msg);

      const parsed = await simpleParser(msg.source as Buffer);
      const messageId  = (parsed.messageId ?? `uid-${uid}-${Date.now()}`).replace(/[<>]/g, '');
      const fromAddr   = parsed.from?.value?.[0]?.address ?? '';
      const subject    = parsed.subject ?? '';
      const text       = parsed.text ?? '';
      const html       = parsed.html || text;
      const receivedAt = parsed.date ?? null;

      const ingested = await this.ingestionService.ingestEmail({
        messageId,
        imapUid:     uid,
        fromAddress: fromAddr,
        subject,
        text,
        html,
        receivedAt:  receivedAt ?? undefined,
      });

      if (ingested !== null) {
        // Mark as seen so we don't pick it up again on the next poll
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        this.logger.log(`Queued email ${messageId} for processing`);
      }
    } catch (err) {
      this.logger.error(`Failed to process UID ${uid}: ${(err as Error).message}`);
      // Do not rethrow — continue to next UID
    }
  }
}
