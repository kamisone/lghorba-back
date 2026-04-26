import { IsBoolean, IsDateString, IsEmail, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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

  @IsEmail()
  @IsOptional()
  guestEmail?: string | null;

  @IsDateString()
  @IsOptional()
  turoJoinDate?: string | null;

  @IsDateString()
  @IsOptional()
  getaroundJoinDate?: string | null;

  @IsUUID()
  @IsOptional()
  userId?: string | null;
}
