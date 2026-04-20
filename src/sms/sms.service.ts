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

  async pollNext(type: SmsType = SmsType.OUTBOUND, to?: string): Promise<SmsMessage | { error: string }> {
    const [sms] = await this.repo.find({
      where: { type, consumed: false, ...(to ? { to } : {}) },
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (!sms) return { error: 'empty' };
    await this.repo.update(sms.id, { consumed: true });
    return { ...sms, consumed: true };
  }
  async pollAll(): Promise<SmsMessage[] | { error: string }> {
    const sms = this.repo.find();
    return sms;
  }

  async addMessage(to: string, message: string, type: SmsType = SmsType.OUTBOUND): Promise<SmsMessage> {
    if (!to || !message) {
      throw new HttpException('body params invalid', 400);
    }
    const sms = this.repo.create({ to, message, type });
    return this.repo.save(sms);
  }
}
