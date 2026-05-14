import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { DlqModule } from '../dlq/dlq.module';
import { SmsModule } from '../sms/sms.module';
import { PlatformSettings } from '../platform-settings/platform-settings.entity';
import { SupportConversation } from './entities/support-conversation.entity';
import { SupportMessage } from './entities/support-message.entity';
import { SupportNotificationLog } from './entities/support-notification-log.entity';
import { SupportAuditLog } from './entities/support-audit-log.entity';
import { SupportConversationsService } from './support-conversations.service';
import { SupportNotificationService } from './support-notification.service';
import { SupportLifecycleService } from './support-lifecycle.service';
import { SupportGateway } from './support.gateway';
import { SupportGuestController } from './support-guest.controller';
import { SupportAdminController } from './support-admin.controller';
import { SupportNotificationProcessor } from './support-notification.processor';
import { SUPPORT_QUEUE } from './support.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportConversation,
      SupportMessage,
      SupportNotificationLog,
      SupportAuditLog,
      PlatformSettings,
    ]),
    BullModule.registerQueue({ name: SUPPORT_QUEUE }),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET env var is required for SupportModule');
        return { secret };
      },
    }),
    DlqModule,
    SmsModule,
  ],
  controllers: [SupportGuestController, SupportAdminController],
  providers: [
    SupportConversationsService,
    SupportNotificationService,
    SupportLifecycleService,
    SupportGateway,
    SupportNotificationProcessor,
  ],
  exports: [SupportConversationsService],
})
export class SupportModule {}
