import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RentSessionsService } from '../rent-sessions/rent-sessions.service';
import { SmsType } from './sms-message.entity';
import { SmsService } from './sms.service';

const SmsMessageSchema = z.object({
  to:      z.string().min(1, 'to is required'),
  message: z.string().min(1, 'message is required'),
});

type SmsMessageDto = z.infer<typeof SmsMessageSchema>;

@Controller()
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly rentSessionsService: RentSessionsService,
  ) {}

  @Public()
  @Get('sms')
  getSmsToSend(@Query('type') type: SmsType = SmsType.OUTBOUND, @Query('to') to?: string) {
    // Express/qs decodes '+' in query strings as a space. Phone numbers that start
    // with '+' (e.g. +33758802028) arrive as ' 33758802028'. Restore the '+'.
    const normalizedTo = to?.startsWith(' ') ? '+' + to.slice(1) : to;
    return this.smsService.pollNext(type, normalizedTo);
  }

  @Get('sms-all')
  getAllSms() {
    return this.smsService.pollAll();
  }

  @Get('sms/last-consumed')
  getLastConsumed(@Query('to') to: string) {
    const normalizedTo = to?.startsWith(' ') ? '+' + to.slice(1) : to;
    return this.smsService.getLastConsumed(normalizedTo);
  }

  @Public()
  @Post('sms')
  sendSms(@Body(new ZodValidationPipe(SmsMessageSchema)) body: SmsMessageDto) {
    return this.smsService.addMessage(body.to, body.message);
  }

  @Public()
  @Post('receive')
  async receiveFromAndroid(@Body(new ZodValidationPipe(SmsMessageSchema)) body: SmsMessageDto) {
    const receivedAt = new Date();
    const result = await this.smsService.addMessage(body.to, body.message, SmsType.INBOUND);
    await this.rentSessionsService.processInboundSms(body.to, body.message, receivedAt);
    return result;
  }
}
