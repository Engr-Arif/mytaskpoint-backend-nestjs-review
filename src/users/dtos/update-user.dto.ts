import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() policeStation?: string;
  @IsOptional() @IsString() territory?: string;
  @IsOptional() @IsString() password?: string;
}
