import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Car } from '../cars/car.entity';
import { SmsService } from '../sms/sms.service';
import { GuestAction, ACTION_SMS_MAP } from './entities/guest-token.entity';

@Injectable()
export class CarControlService {
  constructor(
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    private readonly smsService: SmsService,
  ) {}

  async sendAction(carId: string, action: GuestAction): Promise<void> {
    const car = await this.carRepo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);
    await this.smsService.addMessage(car.phoneNumber, ACTION_SMS_MAP[action]);
  }
}
