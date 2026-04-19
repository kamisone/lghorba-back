import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { SmsService } from './sms/sms.service';

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

  @Get('sms')
  getSmsToSend() {
    return this.smsService.pollNext();
  }

  @Post('sms')
  addSms(@Body() body: { to: string; message: string }) {
    return this.smsService.addMessage(body.to, body.message);
  }

  @Post('push')
  pushSms(@Body() body: { to: string; message: string }, @Req() req) {
    console.log('METHOD:', req.method);
    console.log('URL:', req.url);
    return this.smsService.addMessage(body.to, body.message);
  }
}