import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { GcsModule } from '../gcs/gcs.module';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { TranslationsModule } from '../translations/translations.module';
import { UsersModule } from '../users/users.module';
import { CarPhoto } from './car-photo.entity';
import { Car } from './car.entity';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { PublicCarsController } from './public-cars.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Car, CarPhoto, RentSession]),
    MulterModule.register({
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype.startsWith('image/'));
      },
    }),
    GcsModule,
    UsersModule,
    TranslationsModule,
  ],
  controllers: [CarsController, PublicCarsController],
  providers: [CarsService],
})
export class CarsModule {}
