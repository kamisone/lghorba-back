import { IsBoolean, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
  @IsNumber()
  @Min(0)
  totalEarning?: number | null;

  @IsOptional()
  @IsBoolean()
  autoStartTracking?: boolean;

  @IsOptional()
  @IsString()
  color?: string | null;
}
