import { IsDateString, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  phone?: string | null;

  @IsEmail()
  @IsOptional()
  email?: string | null;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  score?: number | null;

  @IsDateString()
  @IsOptional()
  turoJoinDate?: string | null;

  @IsDateString()
  @IsOptional()
  getaroundJoinDate?: string | null;

  @IsUUID()
  rentSessionId: string;
}
