import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Car } from './cars/car.entity';
import { RentPosition } from './rent-sessions/rent-position.entity';
import { RentSession } from './rent-sessions/rent-session.entity';
import { SmsMessage } from './sms/sms-message.entity';

import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.TYPEORM_HOST || 'localhost',
  port: parseInt(process.env.TYPEORM_PORT) || 5432,
  username: process.env.TYPEORM_USERNAME || 'postgres',
  password: process.env.TYPEORM_PASSWORD || '',
  database: process.env.TYPEORM_DATABASE || 'lghorba',
  entities: [SmsMessage, Car, RentSession, RentPosition],
  migrations: ['src/migrations/*.ts'],
});
