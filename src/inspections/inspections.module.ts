import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { Inspection } from './entities/inspection.entity';
import { InspectionChecklistItem } from './entities/inspection-checklist-item.entity';
import { InspectionPhoto } from './entities/inspection-photo.entity';
import { GcsModule } from '../gcs/gcs.module';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inspection, InspectionChecklistItem, InspectionPhoto]),
    MulterModule.register({ storage: memoryStorage() }),
    GcsModule,
  ],
  controllers: [InspectionsController],
  providers: [InspectionsService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
