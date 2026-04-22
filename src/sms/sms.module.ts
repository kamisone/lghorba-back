import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsMessage } from './sms-message.entity';
import { SmsService } from './sms.service';

@Module({
  imports: [TypeOrmModule.forFeature([SmsMessage])],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
