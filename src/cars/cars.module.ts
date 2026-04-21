import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Car } from './car.entity';
import { CarsController } from './cars.controller';
import { CarsService, UPLOADS_DIR } from './cars.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Car]),
    MulterModule.register({
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype.startsWith('image/'));
      },
    }),
  ],
  controllers: [CarsController],
  providers: [CarsService],
})
export class CarsModule {}
