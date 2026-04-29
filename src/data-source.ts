import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Admin } from './admins/admin.entity';
import { Contact } from './contacts/contact.entity';
import { CarPhoto } from './cars/car-photo.entity';
import { Car } from './cars/car.entity';
import { CarPricing } from './cars/car-pricing.entity';
import { Booking } from './bookings/booking.entity';
import { RentPosition } from './rent-sessions/rent-position.entity';
import { RentSession } from './rent-sessions/rent-session.entity';
import { SmsMessage } from './sms/sms-message.entity';
import { User } from './users/user.entity';

import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.TYPEORM_HOST || 'localhost',
  port: parseInt(process.env.TYPEORM_PORT) || 5432,
  username: process.env.TYPEORM_USERNAME || 'postgres',
  password: process.env.TYPEORM_PASSWORD || '',
  database: process.env.TYPEORM_DATABASE || 'lghorba',
  entities: [SmsMessage, Car, CarPhoto, CarPricing, RentSession, RentPosition, User, Admin, Contact, Booking],
  migrations: ['src/migrations/*.ts'],
});
