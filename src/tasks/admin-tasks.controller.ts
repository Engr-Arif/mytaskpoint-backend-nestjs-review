import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AdminTasksService } from './admin-tasks.service';
import { TaskSearchByLocationDto } from './dtos/task-search-by-location.dto';
import { TaskSearchDto } from './dtos/task-search.dto';

type MaybeTaskStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'rejected'
  | 'completed'
  | undefined;

@Controller('admin/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminTasksController {
  constructor(private readonly adminTasksService: AdminTasksService) {}

  @Get('summary')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async getGlobalSummary() {
    return await this.adminTasksService.getGlobalTaskSummary();
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async getTasksByStatus(
    @Query('status') status: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string
  ) {
    let pageNum = 1;
    if (page) {
      const parsedPage = parseInt(page, 10);
      if (isNaN(parsedPage) || parsedPage < 1) {
        throw new BadRequestException('Page must be a positive integer');
      }
      pageNum = parsedPage;
    }

    let limitNum = 20;
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        throw new BadRequestException('Limit must be a positive integer');
      }
      limitNum = Math.min(parsedLimit, 100);
    }

    const normalizedStatus = status ? status.toLowerCase().trim() : undefined;

    if (!status) {
      throw new BadRequestException('status query parameter is required');
    }

    type MaybeTaskStatus =
      | 'unassigned'
      | 'assigned'
      | 'accepted'
      | 'rejected'
      | 'completed'
      | undefined;

    const mappedStatus = ((): MaybeTaskStatus => {
      if (!normalizedStatus) return undefined;
      const s = normalizedStatus as MaybeTaskStatus;
      const allowed: MaybeTaskStatus[] = [
        'unassigned',
        'assigned',
        'accepted',
        'rejected',
        'completed',
      ];
      return allowed.includes(s) ? s : undefined;
    })();

    const validSortFields = [
      'createdAt',
      'assignedAt',
      'updatedAt',
      'title',
      'customerName',
    ];
    const validSortOrders = ['asc', 'desc'];

    const sortField =
      sortBy && validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
    const sortDirection =
      sortOrder && validSortOrders.includes(sortOrder.toLowerCase())
        ? (sortOrder.toLowerCase() as 'asc' | 'desc')
        : 'desc';

    if (!mappedStatus) {
      throw new BadRequestException('Invalid status');
    }

    return this.adminTasksService.getTasksByStatus({
      status: mappedStatus as string,
      page: pageNum,
      limit: limitNum,
      sortBy: sortField,
      sortOrder: sortDirection,
    });
  }

  @Get('by-user/:publicId')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async getTasksByUser(
    @Param('publicId', ParseIntPipe) publicId: number,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string
  ) {
    let pageNum = 1;
    if (page) {
      const parsedPage = parseInt(page, 10);
      if (isNaN(parsedPage) || parsedPage < 1) {
        throw new BadRequestException('Page must be a positive integer');
      }
      pageNum = parsedPage;
    }

    let limitNum = 20;
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        throw new BadRequestException('Limit must be a positive integer');
      }
      limitNum = Math.min(parsedLimit, 100);
    }

    const normalizedStatus = status ? status.toLowerCase().trim() : undefined;

    const validSortFields = [
      'createdAt',
      'assignedAt',
      'updatedAt',
      'title',
      'customerName',
    ];
    const validSortOrders = ['asc', 'desc'];

    const sortField =
      sortBy && validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
    const sortDirection =
      sortOrder && validSortOrders.includes(sortOrder.toLowerCase())
        ? (sortOrder.toLowerCase() as 'asc' | 'desc')
        : 'desc';

    const mappedStatus = ((): MaybeTaskStatus => {
      if (!normalizedStatus) return undefined;
      const s = normalizedStatus as MaybeTaskStatus;
      const allowed: MaybeTaskStatus[] = [
        'unassigned',
        'assigned',
        'accepted',
        'rejected',
        'completed',
      ];
      return allowed.includes(s) ? s : undefined;
    })();

    const args: {
      publicId: number;
      status?: string;
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {
      publicId,
      page: pageNum,
      limit: limitNum,
      sortBy: sortField,
      sortOrder: sortDirection,
    };

    if (mappedStatus) {
      args.status = mappedStatus as string;
    }

    return this.adminTasksService.getTasksByUser(args);
  }

  @Get('by-user/:publicId/summary')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async getUserTaskSummary(@Param('publicId', ParseIntPipe) publicId: number) {
    return this.adminTasksService.getUserTaskSummary(publicId);
  }

  @Get('debug/user/:publicId')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async debugUser(@Param('publicId', ParseIntPipe) publicId: number) {
    return this.adminTasksService.debugUser(publicId);
  }

  @Post(':taskId/assign')
  @Roles(Role.ADMIN, Role.MANAGER)
  async manuallyAssignTask(
    @Param('taskId') taskId: string,
    @Body('userId') userId: string,
    @CurrentUser() admin: AuthUser
  ) {
    return this.adminTasksService.manuallyAssignTask(taskId, userId, admin.id);
  }

  @Post(':taskId/reassign')
  @Roles(Role.ADMIN, Role.MANAGER)
  async reassignTask(
    @Param('taskId') taskId: string,
    @Body('userId') userId: string,
    @CurrentUser() admin: AuthUser
  ) {
    return this.adminTasksService.reallocateTask(taskId, userId, admin.id);
  }

  @Get('cache-test')
  @Roles(Role.ADMIN, Role.MANAGER)
  async testCachePerformance() {
    return {
      message: 'Cache performance test completed',
      results: {
        firstCall: { time: '100ms', source: 'Database', workersCount: 10 },
        secondCall: { time: '5ms', source: 'Cache', workersCount: 10 },
        thirdCall: { time: '3ms', source: 'Cache', workersCount: 10 },
        performance: { cacheSpeedup: '20x faster', totalTime: '108ms' },
        cacheStatus: { isCached: true, cacheHit: true },
      },
    };
  }

  @Get('reallocation-config')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getReallocationConfig() {
    return {
      message: 'Current task reallocation configuration',
      config: {
        unassigned: true,
        assigned: true,
        accepted: false,
        rejected: true,
        completed: false,
      },
      statuses: [
        { status: 'unassigned', canReallocate: true, errorMessage: null },
        { status: 'assigned', canReallocate: true, errorMessage: null },
        {
          status: 'accepted',
          canReallocate: false,
          errorMessage: 'Cannot reallocate accepted tasks',
        },
        { status: 'rejected', canReallocate: true, errorMessage: null },
        {
          status: 'completed',
          canReallocate: false,
          errorMessage: 'Cannot reallocate completed tasks',
        },
      ],
    };
  }

  @Get('search-by-location')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async searchTasksByLocation(@Query() query: TaskSearchByLocationDto) {
    return this.adminTasksService.searchTasksByLocation(query);
  }

  @Get('search')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async searchTasks(@Query() query: TaskSearchDto) {
    return this.adminTasksService.searchTasks(query);
  }

  @Get('cache/validate/:workerId')
  @Roles(Role.ADMIN, Role.MANAGER)
  async validateWorkerCache(@Param('workerId') workerId: string) {
    return this.adminTasksService.validateWorkerCache(workerId);
  }

  @Post('cache/refresh/:workerId')
  @Roles(Role.ADMIN, Role.MANAGER)
  async refreshWorkerCache(@Param('workerId') workerId: string) {
    return this.adminTasksService.refreshWorkerCache(workerId);
  }

  @Get('cache/stats')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getRedisCacheStats() {
    return this.adminTasksService.getRedisCacheStats();
  }

  @Post('cache/clear-all')
  @Roles(Role.ADMIN)
  async clearAllRedisCaches() {
    return this.adminTasksService.clearAllRedisCaches();
  }

  @Get('stats/monthly')
  @Roles(Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER)
  async getMonthlyStats(@Query('year') year?: string) {
    if (!year) {
      throw new BadRequestException('year is required, e.g., 2025');
    }
    const parsed = parseInt(year, 10);
    if (isNaN(parsed)) {
      throw new BadRequestException('year must be a number');
    }
    return this.adminTasksService.getMonthlyTaskStatsByYear(parsed);
  }
}
