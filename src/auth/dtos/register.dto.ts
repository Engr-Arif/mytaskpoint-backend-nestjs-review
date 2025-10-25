import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsString() fullName!: string;
  @IsEnum(Role) @IsOptional() role?: Role;
  @IsOptional() @IsString() territory?: string;
}
