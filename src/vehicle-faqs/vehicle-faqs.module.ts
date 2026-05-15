import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TranslationsModule } from '../translations/translations.module';
import { VehicleFaq } from './vehicle-faq.entity';
import { VehicleFaqsController } from './vehicle-faqs.controller';
import { VehicleFaqsService } from './vehicle-faqs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VehicleFaq]),
    TranslationsModule,
  ],
  controllers: [VehicleFaqsController],
  providers:   [VehicleFaqsService],
  exports:     [VehicleFaqsService],
})
export class VehicleFaqsModule {}
