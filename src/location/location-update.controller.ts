import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  ValidationPipe,
  UsePipes,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { getErrorMessage } from '../common/utils/error.util';
import { LocationChangeRequestService } from './location-update.service';
import { IsNumber, IsNotEmpty, Min, Max } from 'class-validator';

class LocationChangeRequestDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  lon!: number;
}

@Controller('location-change-request')
export class LocationChangeRequestController {
  private readonly logger = new Logger(LocationChangeRequestController.name);
  constructor(private readonly service: LocationChangeRequestService) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async requestChange(
    @Req() req: Request,
    @Body() body: LocationChangeRequestDto
  ) {
    try {
      const user = (req as any).user as { id?: string } | undefined;
      if (!user || !user.id) {
        throw new BadRequestException('User not authenticated');
      }

      const userId = user.id;
      return await this.service.requestLocationChange(
        userId,
        body.lat,
        body.lon
      );
    } catch (error) {
      this.logger.error('Error in requestChange:', getErrorMessage(error));
      throw error;
    }
  }

  @Get('pending')
  async getPending() {
    return this.service.getPendingRequests();
  }

  @Post(':id/approve')
  async approve(@Req() req: Request, @Param('id') id: string) {
    const admin = (req as any).user as { id?: string } | undefined;
    const adminId = admin?.id;
    if (!adminId) throw new BadRequestException('Admin not authenticated');
    return this.service.approveRequest(id, adminId);
  }

  @Post(':id/reject')
  async reject(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('reason') reason?: string
  ) {
    const admin = (req as any).user as { id?: string } | undefined;
    const adminId = admin?.id;
    if (!adminId) throw new BadRequestException('Admin not authenticated');
    return this.service.rejectRequest(id, adminId, reason);
  }
}
