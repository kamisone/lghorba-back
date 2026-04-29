import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from './admins/admin.entity';
import { AdminsModule } from './admins/admins.module';
import { AuthModule } from './auth/auth.module';
import { Contact } from './contacts/contact.entity';
import { ContactsModule } from './contacts/contacts.module';
import { Translation } from './translations/translation.entity';
import { TranslationsModule } from './translations/translations.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CarPhoto } from './cars/car-photo.entity';
import { Car } from './cars/car.entity';
import { CarPricing } from './cars/car-pricing.entity';
import { Booking } from './bookings/booking.entity';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { CarsModule } from './cars/cars.module';
import { RedisModule } from './redis/redis.module';
import { RentPosition } from './rent-sessions/rent-position.entity';
import { RentSession } from './rent-sessions/rent-session.entity';
import { RentSessionsModule } from './rent-sessions/rent-sessions.module';
import { SmsMessage } from './sms/sms-message.entity';
import { SmsController } from './sms/sms.controller';
import { SmsModule } from './sms/sms.module';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';

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
      entities: [SmsMessage, Car, CarPhoto, CarPricing, RentSession, RentPosition, User, Admin, Contact, Translation, Booking],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      migrationsRun: true,
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    SmsModule,
    AuthModule,
    AdminsModule,
    UsersModule,
    CarsModule,
    RentSessionsModule,
    ContactsModule,
    TranslationsModule,
    BookingsModule,
    PaymentsModule,
  ],
  controllers: [SmsController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
