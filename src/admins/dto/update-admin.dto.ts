import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { AdminRole } from '../admin.entity';

export class UpdateAdminDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(AdminRole)
  @IsOptional()
  role?: AdminRole;
}
