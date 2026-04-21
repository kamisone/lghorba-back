import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRentPositionDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsString()
  @IsOptional()
  rawMessage?: string;

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  recordedAt: Date;
}
