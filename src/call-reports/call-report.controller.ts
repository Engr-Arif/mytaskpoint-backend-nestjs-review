import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CallReportService } from './call-report.service';
import { CreateCallReportDto } from './dtos/create-call-report.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CallResult, DeliveryPossibility } from '@prisma/client';
import { Role } from '../common/enums/role.enum';

enum CallStatus {
  ACTIVE = 'ACTIVE',
  DISMISS = 'DISMISS',
}
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CallReportRateLimitGuard } from './call-report-rate-limit.guard';

import type { User } from '@prisma/client';

@Controller('call-reports')
@UseGuards(CallReportRateLimitGuard)
export class CallReportController {
  constructor(private readonly callService: CallReportService) {}

  @Post()
  create(@Body() dto: CreateCallReportDto, @CurrentUser() user: User) {
    return this.callService.createCallReport(dto, user);
  }

  @Get('task/:taskId')
  getByTask(
    @Param('taskId') taskId: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const activeOnlyBool = activeOnly === 'true';
    const pageNum = page || 1;
    const limitNum = Math.min(limit || 20, 100);

    return this.callService.getCallsByTask(
      taskId,
      activeOnlyBool,
      pageNum,
      limitNum
    );
  }

  @Get('user/:userId')
  getByUser(
    @Param('userId') userId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const pageNum = page || 1;
    const limitNum = Math.min(limit || 20, 100);

    return this.callService.getCallsByUser(userId, pageNum, limitNum);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: CallStatus) {
    return this.callService.updateCallStatus(id, status);
  }

  @Post('admin/dismiss-task/:taskId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  adminBulkDismissByTask(@Param('taskId') taskId: string) {
    return this.callService.adminBulkDismissByTaskId(taskId);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  getCallDashboard(
    @Query('status') status?: CallStatus,
    @Query('callResult') callResult?: CallResult,
    @Query('deliveryPossibility') deliveryPossibility?: DeliveryPossibility,
    @Query('callerRole') callerRole?: Role,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const filtersAll = {
      status: status ?? undefined,
      callResult: callResult ? String(callResult) : undefined,
      deliveryPossibility: deliveryPossibility
        ? String(deliveryPossibility)
        : undefined,
      callerRole: callerRole ? String(callerRole) : undefined,
      startDate,
      endDate,
      page: page || 1,
      limit: Math.min(limit || 20, 100),
    };

    const cleaned: {
      status?: CallStatus;
      callResult?: string;
      deliveryPossibility?: string;
      callerRole?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    } = {};

    for (const [k, v] of Object.entries(filtersAll)) {
      if (v === undefined) continue;
      switch (k) {
        case 'status':
          cleaned.status = v as CallStatus;
          break;
        case 'callResult':
          cleaned.callResult = String(v);
          break;
        case 'deliveryPossibility':
          cleaned.deliveryPossibility = String(v);
          break;
        case 'callerRole':
          cleaned.callerRole = String(v);
          break;
        case 'startDate':
          cleaned.startDate = String(v);
          break;
        case 'endDate':
          cleaned.endDate = String(v);
          break;
        case 'page':
          cleaned.page = Number(v);
          break;
        case 'limit':
          cleaned.limit = Number(v);
          break;
        default:
          break;
      }
    }

    return this.callService.getCallDashboard(cleaned);
  }
}
