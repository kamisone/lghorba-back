import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { EMAIL_INGESTION_QUEUE, EmailIngestionService, ProcessEmailJobData } from './email-ingestion.service';

@Processor(EMAIL_INGESTION_QUEUE)
export class EmailIngestionProcessor extends DlqAwareWorker {
  protected readonly queueName = EMAIL_INGESTION_QUEUE;
  private readonly logger = new Logger(EmailIngestionProcessor.name);

  constructor(dlqService: DlqService, private readonly ingestionService: EmailIngestionService) {
    super(dlqService);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'process-email':
        return this.handleProcessEmail(job as Job<ProcessEmailJobData>);
      default:
        this.logger.warn(`Unknown email-ingestion job: ${job.name}`);
    }
  }

  private async handleProcessEmail(job: Job<ProcessEmailJobData>): Promise<void> {
    const { ingestedEmailId } = job.data;
    this.logger.log(`Processing email ${ingestedEmailId} (attempt ${job.attemptsMade + 1})`);

    try {
      await this.ingestionService.processEmail(ingestedEmailId);
    } catch (err) {
      this.logger.error(`Email ${ingestedEmailId} processing failed: ${(err as Error).message}`);
      throw err; // BullMQ will retry based on job options
    }
  }
}
