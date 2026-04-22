import { IsISO8601 } from 'class-validator';

export class CreateRentScheduleDto {
  @IsISO8601()
  fromDate: string;

  @IsISO8601()
  toDate: string;
}
