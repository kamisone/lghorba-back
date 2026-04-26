import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCarDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  immatriculation: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsString()
  @IsOptional()
  brand?: string | null;

  @IsString()
  @IsOptional()
  model?: string | null;

  @IsString()
  @IsOptional()
  finishing?: string | null;

  @IsInt()
  @Min(1900)
  @IsOptional()
  modelYear?: number | null;

  @IsString()
  @IsOptional()
  vehicleType?: string | null;

  @IsString()
  @IsOptional()
  energy?: string | null;

  @IsString()
  @IsOptional()
  gearbox?: string | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  din?: number | null;

  @IsString()
  @IsOptional()
  mileage?: string | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  numberOfDoors?: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  numberOfSeats?: number | null;

  @IsString()
  @IsOptional()
  color?: string | null;

  @IsString()
  @IsOptional()
  vehicleCondition?: string | null;
}
