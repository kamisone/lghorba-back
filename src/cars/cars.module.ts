import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { GcsModule } from '../gcs/gcs.module';
import { UsersModule } from '../users/users.module';
import { Car } from './car.entity';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { PublicCarsController } from './public-cars.controller';
import { RentSchedule } from './rent-schedule.entity';
import { RentSchedulesService } from './rent-schedules.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Car, RentSchedule]),
    MulterModule.register({
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype.startsWith('image/'));
      },
    }),
    GcsModule,
    UsersModule,
  ],
  controllers: [CarsController, PublicCarsController],
  providers: [CarsService, RentSchedulesService],
})
export class CarsModule {}
