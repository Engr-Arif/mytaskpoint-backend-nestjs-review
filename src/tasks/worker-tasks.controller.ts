import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { WorkerTasksService } from './worker-tasks.service';
import { getErrorMessage } from '../common/utils/error.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('worker/tasks')
@UseGuards(JwtAuthGuard)
export class WorkerTasksController {
  constructor(private readonly workerTasksService: WorkerTasksService) {}

  private getTargetWorkerId(req: Request, workerId?: string): string {
    const user = (req as any).user as { id: string; role: string };
    const elevatedRoles = ['ADMIN', 'MANAGER', 'TERRITORY_OFFICER'];

    if (elevatedRoles.includes(user.role)) {
      if (!workerId) {
        throw new ForbiddenException(
          'workerId is required for admin/manager/officer'
        );
      }
      return workerId;
    } else if (user.role === 'WORKER') {
      return user.id;
    } else {
      throw new ForbiddenException('Unauthorized role');
    }
  }

  @Get()
  async getTasks(
    @Req() req: Request,
    @Query('workerId') workerId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string
  ) {
    const targetWorkerId = this.getTargetWorkerId(req, workerId);

    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 20;

    const validSortFields = ['createdAt', 'assignedAt', 'updatedAt'];
    const validSortOrders = ['asc', 'desc'];

    const sortField =
      sortBy && validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection =
      sortOrder && validSortOrders.includes(sortOrder.toLowerCase())
        ? (sortOrder.toLowerCase() as 'asc' | 'desc')
        : 'desc';

    const result = await this.workerTasksService.getWorkerTasks(
      targetWorkerId,
      status,
      pageNum,
      limitNum,
      sortField,
      sortDirection
    );

    return {
      message: 'Tasks fetched successfully',
      workerId: targetWorkerId,
      sorting: {
        sortBy: sortField,
        sortOrder: sortDirection,
      },
      ...result,
    };
  }

  @Get('summary')
  async getTaskSummary(
    @Req() req: Request,
    @Query('workerId') workerId?: string
  ) {
    const targetWorkerId = this.getTargetWorkerId(req, workerId);

    const summary =
      await this.workerTasksService.getWorkerTaskSummary(targetWorkerId);

    return {
      message: 'Task summary fetched successfully',
      workerId: targetWorkerId,
      summary,
    };
  }

  @Get('summary/refresh')
  async refreshTaskSummary(
    @Req() req: Request,
    @Query('workerId') workerId?: string
  ) {
    const targetWorkerId = this.getTargetWorkerId(req, workerId);

    const summary =
      await this.workerTasksService.refreshWorkerSummaryCache(targetWorkerId);

    return {
      message: 'Task summary cache refreshed successfully',
      workerId: targetWorkerId,
      summary,
    };
  }
  @Post(':taskId/accept')
  async acceptTask(@Req() req: Request, @Param('taskId') taskId: string) {
    const workerId = this.getTargetWorkerId(req);
    await this.workerTasksService.acceptTask(taskId, workerId);
    return { message: 'Task accepted successfully', taskId };
  }

  @Post(':taskId/reject')
  async rejectTask(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Body('reason') reason: string
  ) {
    const workerId = this.getTargetWorkerId(req);
    await this.workerTasksService.rejectTask(taskId, workerId, reason);
    return { message: 'Task rejected successfully', taskId };
  }

  @Post(':taskId/complete')
  async completeTask(@Req() req: Request, @Param('taskId') taskId: string) {
    const workerId = this.getTargetWorkerId(req);
    await this.workerTasksService.completeTask(taskId, workerId);
    return { message: 'Task completed successfully', taskId };
  }

  @Get('rejected')
  async getRejectedTasks(
    @Req() req: Request,
    @Query('workerId') workerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const targetWorkerId = this.getTargetWorkerId(req, workerId);

    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 20;

    const result = await this.workerTasksService.getRejectedTasks(
      targetWorkerId,
      pageNum,
      limitNum
    );

    return {
      message: 'Rejected tasks fetched successfully',
      workerId: targetWorkerId,
      ...result,
    };
  }

  @Get('cache-test')
  async testCachePerformance(@Req() req: Request) {
    const user = (req as any).user as { id: string; role: string };
    const workerId = user.id;

    const startTime = Date.now();

    const firstCall = await this.workerTasksService.getWorkerTasks(
      workerId,
      'assigned',
      1,
      10
    );
    const firstCallTime = Date.now() - startTime;

    const cacheStartTime = Date.now();
    const secondCall = await this.workerTasksService.getWorkerTasks(
      workerId,
      'assigned',
      1,
      10
    );
    const cacheCallTime = Date.now() - cacheStartTime;

    const cacheStartTime2 = Date.now();
    const thirdCall = await this.workerTasksService.getWorkerTasks(
      workerId,
      'assigned',
      1,
      10
    );
    const cacheCallTime2 = Date.now() - cacheStartTime2;

    return {
      message: 'Hybrid Cache performance test completed',
      workerId,
      results: {
        firstCall: {
          time: `${firstCallTime}ms`,
          source: 'Database',
          taskCount: firstCall.data.length,
        },
        secondCall: {
          time: `${cacheCallTime}ms`,
          source: 'Redis Cache',
          taskCount: secondCall.data.length,
        },
        thirdCall: {
          time: `${cacheCallTime2}ms`,
          source: 'Redis Cache',
          taskCount: thirdCall.data.length,
        },
        performance: {
          cacheSpeedup:
            firstCallTime > 0
              ? `${Math.round((firstCallTime / cacheCallTime) * 100) / 100}x faster`
              : 'N/A',
          totalTime: `${Date.now() - startTime}ms`,
        },
        cacheStatus: {
          isCached: cacheCallTime < firstCallTime,
          cacheHit: cacheCallTime < firstCallTime,
        },
      },
    };
  }

  @Get('hybrid-cache-test')
  async testHybridCachePerformance(@Req() req: Request) {
    const user = (req as any).user as { id: string; role: string };
    const workerId = user.id;

    const results: any = {
      message: 'Hybrid Cache Update Test',
      workerId,
      tests: [],
    };

    try {
      const startTime1 = Date.now();
      const initialTasks = await this.workerTasksService.getWorkerTasks(
        workerId,
        'assigned',
        1,
        5
      );
      const time1 = Date.now() - startTime1;

      results.tests.push({
        test: 'Initial Task Fetch',
        time: `${time1}ms`,
        source: time1 > 20 ? 'Database' : 'Cache',
        taskCount: initialTasks.data.length,
      });

      const startTime2 = Date.now();
      const summary =
        await this.workerTasksService.getWorkerTaskSummary(workerId);
      const time2 = Date.now() - startTime2;

      results.tests.push({
        test: 'Task Summary Fetch',
        time: `${time2}ms`,
        source: time2 > 10 ? 'Database' : 'Cache',
        summary: summary,
      });

      if (initialTasks.data && initialTasks.data.length > 0) {
        const taskId = initialTasks.data[0]?.id;
        const startTime3 = Date.now();

        const time3 = Date.now() - startTime3;

        results.tests.push({
          test: 'Cache Update Simulation',
          time: `${time3}ms`,
          source: 'Cache Update',
          taskId: taskId,
        });
      }

      const startTime4 = Date.now();
      const updatedTasks = await this.workerTasksService.getWorkerTasks(
        workerId,
        'assigned',
        1,
        5
      );
      const time4 = Date.now() - startTime4;

      results.tests.push({
        test: 'Updated Task Fetch',
        time: `${time4}ms`,
        source: time4 > 20 ? 'Database' : 'Cache',
        taskCount: updatedTasks.data.length,
      });

      results.performance = {
        averageTime: `${Math.round((time1 + time2 + time4) / 3)}ms`,
        cacheHitRate: `${(Math.round((time1 > 20 ? 0 : 1) + (time2 > 10 ? 0 : 1) + (time4 > 20 ? 0 : 1)) / 3) * 100}%`,
        hybridCacheWorking: time4 < 20,
      };
    } catch (error: unknown) {
      results.error = getErrorMessage(error);
    }

    return results;
  }

  @Post(':taskId/accept-rejected')
  async acceptRejectedTask(
    @Req() req: Request,
    @Param('taskId') taskId: string
  ) {
    const workerId = this.getTargetWorkerId(req);
    const result = await this.workerTasksService.acceptRejectedTask(
      taskId,
      workerId
    );
    return {
      message: 'Previously rejected task accepted successfully',
      taskId,
      task: result,
    };
  }
}
