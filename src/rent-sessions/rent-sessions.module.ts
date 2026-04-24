import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from '../cars/car.entity';
import { RentSchedule } from '../cars/rent-schedule.entity';
import { SmsModule } from '../sms/sms.module';
import { RentPosition } from './rent-position.entity';
import { RentSession } from './rent-session.entity';
import { RentSessionsController } from './rent-sessions.controller';
import { RentSessionsTasksService } from './rent-sessions-tasks.service';
import { RentSessionsService } from './rent-sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RentSession, RentPosition, RentSchedule, Car]),
    SmsModule,
  ],
  controllers: [RentSessionsController],
  providers: [RentSessionsService, RentSessionsTasksService],
  exports: [RentSessionsService],
})
export class RentSessionsModule {}
