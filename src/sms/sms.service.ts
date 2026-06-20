import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SmsMessage, SmsType } from './sms-message.entity';

@Injectable()
export class SmsService {
  constructor(
    @InjectRepository(SmsMessage)
    private readonly repo: Repository<SmsMessage>,
  ) {}

  async pollNext(
    type: SmsType = SmsType.OUTBOUND,
    to?: string,
  ): Promise<SmsMessage | { error: string }> {
    const [sms] = await this.repo.find({
      where: { type, consumed: false, ...(to ? { to } : {}) },
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (!sms) return { error: 'empty' };
    await this.repo.update(sms.id, { consumed: true });
    await this.pruneConsumedForNumber(sms.to);
    return { ...sms, consumed: true };
  }

  private async pruneConsumedForNumber(to: string): Promise<void> {
    const keepIds: number[] = [];

    for (const type of [SmsType.OUTBOUND, SmsType.INBOUND]) {
      const [last] = await this.repo.find({
        where: { consumed: true, type, to },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      if (last) keepIds.push(last.id);
    }

    await this.repo
      .createQueryBuilder()
      .delete()
      .where('consumed = true AND "to" = :to AND id NOT IN (:...keepIds)', {
        to,
        keepIds,
      })
      .execute();
  }

  async getLastConsumed(
    to: string,
  ): Promise<{ inbound: SmsMessage | null; outbound: SmsMessage | null }> {
    const unconsumed = await this.repo.find({
      where: { type: SmsType.INBOUND, consumed: false, ...(to ? { to } : {}) },
      order: { createdAt: 'ASC' },
    });
    if (unconsumed.length > 0) {
      await this.repo.update({ id: In(unconsumed.map(s => s.id)) }, { consumed: true });
      await this.pruneConsumedForNumber(to);
    }

    const where = (type: SmsType) => ({
      consumed: true,
      type,
      ...(to ? { to } : {}),
    });

    const [inbound, outbound] = await Promise.all([
      this.repo
        .find({
          where: where(SmsType.INBOUND),
          order: { createdAt: 'DESC' },
          take: 1,
        })
        .then(([r]) => r ?? null),
      this.repo
        .find({
          where: where(SmsType.OUTBOUND),
          order: { createdAt: 'DESC' },
          take: 1,
        })
        .then(([r]) => r ?? null),
    ]);

    return { inbound, outbound };
  }
  async pollAll(): Promise<SmsMessage[]> {
    return this.repo.find();
  }

  /** Returns the `consumed` flag for each requested message id.
   *  Ids absent from the DB were pruned after delivery and are treated as consumed. */
  async getConsumedStatuses(ids: number[]): Promise<Map<number, boolean>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repo.find({ where: { id: In(ids) }, select: ['id', 'consumed'] });
    const result = new Map(rows.map(r => [r.id, r.consumed]));
    for (const id of ids) {
      if (!result.has(id)) result.set(id, true);
    }
    return result;
  }

  async ack(id: number): Promise<{ ok: boolean }> {
    const sms = await this.repo.findOneBy({ id });
    if (!sms) return { ok: false };
    if (!sms.consumed) {
      await this.repo.update(id, { consumed: true });
    }
    return { ok: true };
  }

  async addMessage(
    to: string,
    message: string,
    type: SmsType = SmsType.OUTBOUND,
  ): Promise<SmsMessage> {
    if (!to || !message) {
      throw new HttpException('body params invalid', 400);
    }
    const normalized = this.normalizePhone(to);
    const sanitized = this.sanitizeForGsm(message);
    const sms = this.repo.create({ to: normalized, message: sanitized, type });
    return this.repo.save(sms);
  }

  private normalizePhone(raw: string): string {
    return raw.replace(/\s+/g, '').replace(/^00/, '+');
  }

  private sanitizeForGsm(text: string): string {
    return text
      .replace(/€/g, 'EUR')
      .replace(/[—–]/g, '-')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }
}
