import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsString() fullName!: string;
  @IsString() district!: string;
  @IsString() policeStation!: string;
  @IsString() area!: string;
  @IsEnum(Role) @IsOptional() role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;

  @IsOptional() @IsString() territory?: string;
}
