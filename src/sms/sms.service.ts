import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      .where('consumed = true AND "to" = :to AND id NOT IN (:...keepIds)', { to, keepIds })
      .execute();
  }

  async getLastConsumed(
    to: string,
  ): Promise<{ inbound: SmsMessage | null; outbound: SmsMessage | null }> {
    const where = (type: SmsType) => ({
      consumed: true,
      type,
      ...(to ? { to } : {}),
    });

    const [inbound, outbound] = await Promise.all([
      this.repo
        .find({ where: where(SmsType.INBOUND), order: { createdAt: 'DESC' }, take: 1 })
        .then(([r]) => r ?? null),
      this.repo
        .find({ where: where(SmsType.OUTBOUND), order: { createdAt: 'DESC' }, take: 1 })
        .then(([r]) => r ?? null),
    ]);

    return { inbound, outbound };
  }
  async pollAll(): Promise<SmsMessage[] | { error: string }> {
    const sms = this.repo.find();
    return sms;
  }

  async addMessage(
    to: string,
    message: string,
    type: SmsType = SmsType.OUTBOUND,
  ): Promise<SmsMessage> {
    if (!to || !message) {
      throw new HttpException('body params invalid', 400);
    }
    const sms = this.repo.create({ to, message, type });
    return this.repo.save(sms);
  }
}
