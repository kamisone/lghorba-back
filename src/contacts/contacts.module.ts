import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AntiSpamModule } from '../common/anti-spam/anti-spam.module';
import { Contact } from './contact.entity';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact]), AntiSpamModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
