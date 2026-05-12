import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { CarControlService } from './car-control.service';
import { GUEST_ACTIONS_QUEUE, GuestActionJobData } from './guest-token.service';

@Processor(GUEST_ACTIONS_QUEUE)
export class GuestActionProcessor extends DlqAwareWorker {
  protected readonly queueName = GUEST_ACTIONS_QUEUE;
  private readonly logger = new Logger(GuestActionProcessor.name);

  constructor(dlqService: DlqService, private readonly carControl: CarControlService) {
    super(dlqService);
  }

  async process(job: Job<GuestActionJobData>): Promise<void> {
    const { tokenId, carId, action } = job.data;
    this.logger.log(`Guest action ${action} for car ${carId} (token ${tokenId})`);

    try {
      await this.carControl.sendAction(carId, action);
    } catch (err) {
      this.logger.error(`Guest action failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
