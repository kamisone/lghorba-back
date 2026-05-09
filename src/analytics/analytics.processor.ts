import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { AnalyticsService } from './analytics.service';
import { ANALYTICS_QUEUE } from './analytics.constants';

@Processor(ANALYTICS_QUEUE)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectQueue(ANALYTICS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'warm-cache':
        await this.analyticsService.warmCache();
        break;
      default:
        this.logger.warn(`Unknown analytics job: ${job.name}`);
    }
  }

  /** Runs daily at 02:00 — invalidates stale cache and precomputes common queries. */
  @Cron('0 2 * * *')
  async scheduleNightlyWarm(): Promise<void> {
    this.logger.log('Scheduling nightly analytics cache warm');
    await this.queue.add('warm-cache', {}, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 50,
      removeOnFail: 20,
    });
  }
}
