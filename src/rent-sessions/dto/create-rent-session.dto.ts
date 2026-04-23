import { IsOptional, IsUUID } from 'class-validator';

export class CreateRentSessionDto {
  @IsUUID()
  carId: string;

  @IsOptional()
  @IsUUID()
  scheduleId?: string;
}
