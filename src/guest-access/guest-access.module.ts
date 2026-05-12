import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DlqModule } from '../dlq/dlq.module';
import { Car } from '../cars/car.entity';
import { SmsModule } from '../sms/sms.module';
import { GuestToken } from './entities/guest-token.entity';
import { GuestTokenAuditLog } from './entities/guest-token-audit.entity';
import { CarControlService } from './car-control.service';
import { GuestTokenService, GUEST_ACTIONS_QUEUE } from './guest-token.service';
import { GuestActionProcessor } from './guest-action.processor';
import { GuestAccessController } from './guest-access.controller';
import { GuestTokensAdminController } from './guest-tokens.admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GuestToken, GuestTokenAuditLog, Car]),
    BullModule.registerQueue({ name: GUEST_ACTIONS_QUEUE }),
    DlqModule,
    SmsModule,
  ],
  controllers: [GuestAccessController, GuestTokensAdminController],
  providers: [CarControlService, GuestTokenService, GuestActionProcessor],
})
export class GuestAccessModule {}
