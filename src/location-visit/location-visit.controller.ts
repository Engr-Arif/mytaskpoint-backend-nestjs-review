import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { LocationVisitService } from './location-visit.service';
import { CreateLocationVisitDto } from './dtos/create-location-visit.dto';
import { CheckinHistoryFilterDto } from './dtos/checkin-history-filter.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { User } from '@prisma/client';

@Controller('api/location-visits')
@UseGuards(JwtAuthGuard)
export class LocationVisitController {
  constructor(private readonly locationVisitService: LocationVisitService) {}

  @Post()
  createLocationVisit(
    @Body() dto: CreateLocationVisitDto,
    @CurrentUser() user: User
  ) {
    return this.locationVisitService.createLocationVisit(dto, user);
  }

  @Get('user/:userId')
  getLocationVisitsByUser(
    @Param('userId') userId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.locationVisitService.getLocationVisitsByUser(
      userId,
      page || 1,
      limit || 10
    );
  }

  @Get('task/:taskId')
  getLocationVisitsByTask(@Param('taskId') taskId: string) {
    return this.locationVisitService.getLocationVisitsByTask(taskId);
  }

  @Get('recent')
  getRecentLocationVisits(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.locationVisitService.getRecentLocationVisits(
      page || 1,
      limit || 50
    );
  }

  @Get('date-range')
  getLocationVisitsByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    const toLocalStartOfDay = (dateStr: string) => {
      const [yRaw, mRaw, dRaw] = dateStr.split('-').map((v) => parseInt(v, 10));
      const y = yRaw ?? 1970;
      const m = mRaw ?? 1;
      const d = dRaw ?? 1;
      return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
    };
    const toLocalEndOfDay = (dateStr: string) => {
      const [yRaw, mRaw, dRaw] = dateStr.split('-').map((v) => parseInt(v, 10));
      const y = yRaw ?? 1970;
      const m = mRaw ?? 1;
      const d = dRaw ?? 1;
      return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
    };

    const start = startDate
      ? toLocalStartOfDay(startDate)
      : (undefined as unknown as Date);
    const end = endDate
      ? toLocalEndOfDay(endDate)
      : (undefined as unknown as Date);
    return this.locationVisitService.getLocationVisitsByDateRange(
      start,
      end,
      page || 1,
      limit || 10
    );
  }

  @Get('my-visits')
  getMyLocationVisits(
    @CurrentUser() user: User,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.locationVisitService.getLocationVisitsByUser(
      user.id,
      page || 1,
      limit || 10
    );
  }

  @Get('admin/history')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  getCheckinHistory(@Query() filters: CheckinHistoryFilterDto) {
    return this.locationVisitService.getCheckinHistory(filters);
  }
}
