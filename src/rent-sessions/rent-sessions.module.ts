import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RentPosition } from './rent-position.entity';
import { RentSession } from './rent-session.entity';
import { RentSessionsController } from './rent-sessions.controller';
import { RentSessionsService } from './rent-sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([RentSession, RentPosition])],
  controllers: [RentSessionsController],
  providers: [RentSessionsService],
})
export class RentSessionsModule {}
