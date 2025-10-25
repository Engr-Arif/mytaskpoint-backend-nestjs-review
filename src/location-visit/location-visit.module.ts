import { Module } from '@nestjs/common';
import { LocationVisitService } from './location-visit.service';
import { LocationVisitController } from './location-visit.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [LocationVisitController],
  providers: [LocationVisitService, PrismaService],
  exports: [LocationVisitService],
})
export class LocationVisitModule {}
