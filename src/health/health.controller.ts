import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator';
import { RedisService } from '../redis/redis.service';
import { BOOKING_EXPIRATION_QUEUE } from '../bookings/booking-expiration.constants';
import { BOOKING_REMINDER_QUEUE } from '../booking-reminders/booking-reminders.constants';
import { DLQ_QUEUE } from '../dlq/dlq.constants';

interface CheckResult {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
  [key: string]: unknown;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()      private readonly db:             DataSource,
    private readonly         redis:                           RedisService,
    @InjectQueue(BOOKING_EXPIRATION_QUEUE) private readonly expirationQueue: Queue,
    @InjectQueue(BOOKING_REMINDER_QUEUE)   private readonly reminderQueue:   Queue,
    @InjectQueue(DLQ_QUEUE)                private readonly dlqQueue:        Queue,
  ) {}

  @Get()
  async check() {
    const [dbR, redisR, queuesR] = await Promise.allSettled([
      this.checkDb(),
      this.checkRedis(),
      this.checkQueues(),
    ]);

    const db     = dbR.status     === 'fulfilled' ? dbR.value     : { status: 'down' as const, error: String((dbR as PromiseRejectedResult).reason) };
    const red    = redisR.status  === 'fulfilled' ? redisR.value  : { status: 'down' as const, error: String((redisR as PromiseRejectedResult).reason) };
    const queues = queuesR.status === 'fulfilled' ? queuesR.value : { status: 'down' as const };

    const overall =
      db.status === 'down' || red.status === 'down'
        ? 'down'
        : Object.values(queues).some(q => (q as CheckResult)?.status === 'degraded')
          ? 'degraded'
          : 'ok';

    return {
      status:    overall,
      uptime:    Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      db,
      redis: red,
      queues,
    };
  }

  private async checkDb(): Promise<CheckResult> {
    const t0 = Date.now();
    await this.db.query('SELECT 1');
    return { status: 'ok', latencyMs: Date.now() - t0 };
  }

  private async checkRedis(): Promise<CheckResult> {
    const t0 = Date.now();
    await this.redis.client.ping();
    return { status: 'ok', latencyMs: Date.now() - t0 };
  }

  private async checkQueues() {
    const [exp, rem, dlq] = await Promise.all([
      this.expirationQueue.getJobCounts('waiting', 'active', 'failed'),
      this.reminderQueue.getJobCounts('waiting', 'active', 'failed'),
      this.dlqQueue.getJobCounts('waiting'),
    ]);

    return {
      [BOOKING_EXPIRATION_QUEUE]: {
        status: exp.failed > 0 ? 'degraded' : 'ok',
        waiting: exp.waiting, active: exp.active, failed: exp.failed,
      },
      [BOOKING_REMINDER_QUEUE]: {
        status: rem.failed > 0 ? 'degraded' : 'ok',
        waiting: rem.waiting, active: rem.active, failed: rem.failed,
      },
      [DLQ_QUEUE]: {
        status: dlq.waiting > 0 ? 'degraded' : 'ok',
        depth:  dlq.waiting,
      },
    };
  }
}
