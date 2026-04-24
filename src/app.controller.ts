import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { RentSessionsService } from './rent-sessions/rent-sessions.service';
import { SmsType } from './sms/sms-message.entity';
import { SmsService } from './sms/sms.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly smsService: SmsService,
    private readonly rentSessionsService: RentSessionsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

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
  getLastConsumedSmsFromBrowser(@Query('to') to: string) {
    return this.smsService.getLastConsumed(to);
  }

  @Public()
  @Post('sms')
  receiveSmsFromBrowser(@Body() body: { to: string; message: string }) {
    return this.smsService.addMessage(body.to, body.message);
  }

  @Public()
  @Post('receive')
  async receiveSmsFromAndroid(@Body() body: { to: string; message: string }) {
    const receivedAt = new Date();
    const result = await this.smsService.addMessage(body.to, body.message, SmsType.INBOUND);
    await this.rentSessionsService.processInboundSms(body.to, body.message, receivedAt);
    return result;
  }
}