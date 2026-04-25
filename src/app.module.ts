import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Car } from './cars/car.entity';
import { RentSchedule } from './cars/rent-schedule.entity';
import { CarsModule } from './cars/cars.module';
import { RentPosition } from './rent-sessions/rent-position.entity';
import { RentSession } from './rent-sessions/rent-session.entity';
import { RentSessionsModule } from './rent-sessions/rent-sessions.module';
import { SmsMessage } from './sms/sms-message.entity';
import { SmsController } from './sms/sms.controller';
import { SmsModule } from './sms/sms.module';

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
      entities: [SmsMessage, Car, RentSchedule, RentSession, RentPosition],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      migrationsRun: true,
    }),
    ScheduleModule.forRoot(),
    SmsModule,
    AuthModule,
    CarsModule,
    RentSessionsModule,
  ],
  controllers: [SmsController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
