import { PartialType } from '@nestjs/mapped-types';
import { CreateRentScheduleDto } from './create-rent-schedule.dto';

export class UpdateRentScheduleDto extends PartialType(CreateRentScheduleDto) {}
