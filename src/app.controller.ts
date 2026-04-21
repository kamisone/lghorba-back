import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { SmsService } from './sms/sms.service';
import { SmsType } from './sms/sms-message.entity';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly smsService: SmsService,
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
  receiveSmsFromAndroid(@Body() body: { to: string; message: string }) {
    return this.smsService.addMessage(body.to, body.message, SmsType.INBOUND);
  }
}