import { IsISO8601, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateRentScheduleDto {
  @IsISO8601()
  fromDate: string;

  @IsISO8601()
  toDate: string;

  @IsOptional()
  @IsString()
  guestName?: string;

  @IsOptional()
  @IsString()
  guestNumber?: string;

  @IsOptional()
  @IsString()
  reservationNumber?: string;

  @IsOptional()
  @IsNumberString()
  totalEarning?: string;
}
