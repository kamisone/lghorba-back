import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { Incident } from './entities/incident.entity';
import { IncidentPhoto } from './entities/incident-photo.entity';
import { GcsModule } from '../gcs/gcs.module';
import { VehicleHealthModule } from '../vehicle-health/vehicle-health.module';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Incident, IncidentPhoto]),
    MulterModule.register({ storage: memoryStorage() }),
    GcsModule,
    VehicleHealthModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
