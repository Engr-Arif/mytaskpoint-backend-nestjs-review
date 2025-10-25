import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationChangeRequestService } from './location-update.service';
import { LocationChangeRequestController } from './location-update.controller';

@Module({
  controllers: [LocationChangeRequestController],
  providers: [LocationChangeRequestService, PrismaService],
  exports: [LocationChangeRequestService],
})
export class LocationChangeRequestModule {}
