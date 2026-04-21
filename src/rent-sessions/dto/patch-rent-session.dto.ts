import { IsEnum } from 'class-validator';
import { RentSessionStatus } from '../rent-session.entity';

export class PatchRentSessionDto {
  @IsEnum(RentSessionStatus)
  status: RentSessionStatus;
}
