import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { RentSessionStatus } from '../rent-session.entity';

export class PatchRentSessionDto {
  @IsOptional()
  @IsEnum(RentSessionStatus)
  status?: RentSessionStatus;

  @IsOptional()
  @IsISO8601()
  lastLocationRequestedAt?: string;
}
