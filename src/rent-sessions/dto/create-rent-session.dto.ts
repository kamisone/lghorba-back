import { IsUUID } from 'class-validator';

export class CreateRentSessionDto {
  @IsUUID()
  carId: string;
}
