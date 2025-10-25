import {
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsIn,
  IsEnum,
} from 'class-validator';

enum CallStatus {
  ACTIVE = 'ACTIVE',
  DISMISS = 'DISMISS',
}

export class CreateCallReportDto {
  @IsNotEmpty() taskId!: string;

  @IsDateString() callStartTime!: string;
  @IsDateString() callEndTime!: string;
  @IsIn(['PHONE_OFF', 'USER_BUSY', 'RECEIVED'])
  callResult!: string;
  @IsIn(['POSSIBLE', 'NOT_POSSIBLE'])
  deliveryPossibility!: string;
  @IsOptional() @IsEnum(CallStatus) status?: CallStatus;
  @IsOptional() notes?: string;
}
