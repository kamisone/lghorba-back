import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RentSessionsService } from '../rent-sessions/rent-sessions.service';
import { SmsType } from './sms-message.entity';
import { SmsService } from './sms.service';

@Controller()
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly rentSessionsService: RentSessionsService,
  ) {}

  @Public()
  @Get('sms')
  getSmsToSend(@Query('type') type: SmsType = SmsType.OUTBOUND, @Query('to') to?: string) {
    return this.smsService.pollNext(type, to);
  }

  @Get('sms-all')
  getAllSms() {
    return this.smsService.pollAll();
  }

  @Get('sms/last-consumed')
  getLastConsumed(@Query('to') to: string) {
    return this.smsService.getLastConsumed(to);
  }

  @Public()
  @Post('sms')
  sendSms(@Body() body: { to: string; message: string }) {
    return this.smsService.addMessage(body.to, body.message);
  }

  @Public()
  @Post('receive')
  async receiveFromAndroid(@Body() body: { to: string; message: string }) {
    const receivedAt = new Date();
    const result = await this.smsService.addMessage(body.to, body.message, SmsType.INBOUND);
    await this.rentSessionsService.processInboundSms(body.to, body.message, receivedAt);
    return result;
  }
}
