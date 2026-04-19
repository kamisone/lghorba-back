import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SmsMessage } from './sms/sms-message.entity';
import { SmsService } from './sms/sms.service';

import { config } from 'dotenv';

config();



@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.TYPEORM_HOST || 'localhost',
      port: parseInt(process.env.TYPEORM_PORT) || 5432,
      username: process.env.TYPEORM_USERNAME || 'postgres',
      password: process.env.TYPEORM_PASSWORD || '',
      database: process.env.TYPEORM_DATABASE || 'lghorba',
      entities: [SmsMessage],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      migrationsRun: true,
    }),
    TypeOrmModule.forFeature([SmsMessage]),
  ],
  controllers: [AppController],
  providers: [AppService, SmsService],
})
export class AppModule {}
