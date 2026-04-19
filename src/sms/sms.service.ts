import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsMessage } from './sms-message.entity';

@Injectable()
export class SmsService {
  constructor(
    @InjectRepository(SmsMessage)
    private readonly repo: Repository<SmsMessage>,
  ) {}

  async pollNext(): Promise<SmsMessage | { error: string }> {
    const [sms] = await this.repo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (!sms) return { error: 'empty' };
    await this.repo.delete(sms.id);
    return sms;
  }

  async addMessage(to: string, message: string): Promise<SmsMessage> {
    if(!to || !message) {
      throw new HttpException('body params invalid', 400);
    }
    const sms = this.repo.create({ to, message });
    return this.repo.save(sms);
  }
}
