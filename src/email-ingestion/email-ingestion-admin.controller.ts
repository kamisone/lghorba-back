import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { EmailIngestionService } from './email-ingestion.service';
import { ImapPollerService } from './imap-poller.service';
import { IngestionStatus } from './entities/ingested-email.entity';

const VALID_STATUSES: IngestionStatus[] = ['pending', 'parsed', 'matched', 'booked', 'skipped', 'failed'];

@Controller('admin/email-ingestion')
export class EmailIngestionAdminController {
  constructor(
    private readonly ingestionService: EmailIngestionService,
    private readonly pollerService: ImapPollerService,
  ) {}

  /** List ingested emails, optionally filtered by status. */
  @Get()
  findAll(@Query('status') status?: string) {
    const s = status as IngestionStatus | undefined;
    if (s && !VALID_STATUSES.includes(s)) {
      throw new BadRequestException(`Invalid status "${s}"`);
    }
    return this.ingestionService.findAll(s);
  }

  /** Ingestion status counts per status bucket. */
  @Get('stats')
  stats() {
    return this.ingestionService.stats();
  }

  /** Full details of one ingested email (includes raw text, extracted payload). */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const email = await this.ingestionService.findOne(id);
    if (!email) throw new NotFoundException(`IngestedEmail ${id} not found`);
    return email;
  }

  /** Replay processing for a failed or skipped email. */
  @Post(':id/replay')
  async replay(@Param('id') id: string) {
    await this.ingestionService.replayEmail(id);
    return { queued: true };
  }

  /** Manually trigger an IMAP poll (useful during development / incident response). */
  @Post('poll')
  async triggerPoll() {
    // fire-and-forget; the poller manages its own mutex
    void this.pollerService.poll();
    return { triggered: true };
  }
}
