import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceEventLog } from './commerce-event-log.entity';
import { CommerceEventName } from './commerce-events';

@Injectable()
export class CommerceEventBus {
  private readonly logger = new Logger(CommerceEventBus.name);

  constructor(
    private readonly emitter: EventEmitter2,
    @InjectRepository(CommerceEventLog)
    private readonly logRepo: Repository<CommerceEventLog>,
  ) {}

  emit(
    eventName: CommerceEventName,
    payload: Record<string, unknown>,
    opts: { entityId?: string; source?: string } = {},
  ): void {
    // Persist audit log entry asynchronously — never block the calling transaction
    setImmediate(async () => {
      try {
        await this.logRepo.save(this.logRepo.create({
          eventName,
          entityId: opts.entityId ?? null,
          payload,
          source:   opts.source ?? null,
          status:   'success',
        }));
      } catch (err) {
        this.logger.warn(`Event log write failed for ${eventName}: ${(err as Error).message}`);
      }
    });

    this.emitter.emit(eventName, payload);
  }

  async queryLog(opts: {
    eventName?: CommerceEventName;
    entityId?:  string;
    limit?:     number;
    offset?:    number;
  } = {}): Promise<{ items: CommerceEventLog[]; total: number }> {
    const { eventName, entityId, limit = 50, offset = 0 } = opts;
    const qb = this.logRepo.createQueryBuilder('e')
      .orderBy('e.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (eventName) qb.andWhere('e.eventName = :eventName', { eventName });
    if (entityId)  qb.andWhere('e.entityId = :entityId',   { entityId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
