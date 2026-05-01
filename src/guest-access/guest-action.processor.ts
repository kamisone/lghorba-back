import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CarControlService } from './car-control.service';
import { GUEST_ACTIONS_QUEUE, GuestActionJobData } from './guest-token.service';

@Processor(GUEST_ACTIONS_QUEUE)
export class GuestActionProcessor extends WorkerHost {
  private readonly logger = new Logger(GuestActionProcessor.name);

  constructor(private readonly carControl: CarControlService) {
    super();
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
