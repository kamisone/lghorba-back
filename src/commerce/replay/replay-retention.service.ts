import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { GcsService } from '../../gcs/gcs.service';
import { ReplaySession } from '../entities/replay-session.entity';
import { ReplaySessionChunk } from '../entities/replay-session-chunk.entity';
import { ReplayEvent } from '../entities/replay-event.entity';
import { REPLAY_RETENTION_DAYS } from './replay.constants';
import { retentionCutoff } from './replay.util';

/**
 * Purges session replays older than REPLAY_RETENTION_DAYS — data
 * minimization for what is, by a wide margin, the most privacy-sensitive
 * data this app records. Modeled on CheckoutSessionCleanupService: a small,
 * single-purpose cron that logs only when it actually deleted something.
 *
 * Deletes GCS objects explicitly rather than relying on a bucket lifecycle
 * rule, so retention doesn't silently depend on external infra config.
 */
@Injectable()
export class ReplayRetentionService {
  private readonly logger = new Logger(ReplayRetentionService.name);

  constructor(
    @InjectRepository(ReplaySession) private readonly sessionRepo: Repository<ReplaySession>,
    @InjectRepository(ReplaySessionChunk) private readonly chunkRepo: Repository<ReplaySessionChunk>,
    @InjectRepository(ReplayEvent) private readonly eventRepo: Repository<ReplayEvent>,
    private readonly gcs: GcsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpiredSessions(): Promise<void> {
    const cutoff = retentionCutoff(REPLAY_RETENTION_DAYS);
    const expired = await this.sessionRepo.find({
      where: { createdAt: LessThan(cutoff) },
      select: ['id'],
    });
    if (!expired.length) return;

    const ids = expired.map((s) => s.id);
    const chunks = await this.chunkRepo.find({ where: { sessionId: In(ids) } });

    for (const chunk of chunks) {
      await this.gcs.delete(chunk.gcsObjectKey);
    }
    await this.chunkRepo.delete({ sessionId: In(ids) });
    await this.eventRepo.delete({ sessionId: In(ids) });
    await this.sessionRepo.delete({ id: In(ids) });

    this.logger.log(`Purged ${ids.length} expired replay session(s) (older than ${REPLAY_RETENTION_DAYS}d)`);
  }
}
