
import { Module } from '@nestjs/common';
import { CallReportService } from './call-report.service';
import { CallReportController } from './call-report.controller';
import { CallReportCacheService } from './call-report-cache.service';
import { CallReportRateLimitGuard } from './call-report-rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [CallReportController],
  providers: [
    CallReportService,
    CallReportCacheService,
    CallReportRateLimitGuard,
    PrismaService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [CallReportService, CallReportCacheService],
})
export class CallReportModule {}
