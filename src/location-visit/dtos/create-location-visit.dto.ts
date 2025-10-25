import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateLocationVisitDto {
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, { message: 'taskId must be a valid CUID' })
  taskId?: string;

  @IsNotEmpty()
  @IsNumber()
  lat!: number;

  @IsNotEmpty()
  @IsNumber()
  lon!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
