import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('sms')
  getSmsToSend() {
    return {
      to: '+33758439121',
      message: 'Hello from api',
    };
  }
}
