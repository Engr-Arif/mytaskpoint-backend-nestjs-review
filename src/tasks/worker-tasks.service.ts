import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallReportService } from '../call-reports/call-report.service';
// import type { TaskStatus as TaskStatusFallback } from '@prisma/client';
import { getErrorMessage } from '../common/utils/error.util';

const RealTaskStatus: any = null;
import { TaskTransformerService } from './services/task-transformer.service';
import { RedisCacheService } from '../common/services/redis-cache.service';
import {
  PaginatedTasksResponseDto,
  TaskSummaryResponseDto,
} from './dtos/task-response.dto';

@Injectable()
export class WorkerTasksService {
  private readonly logger = new Logger(WorkerTasksService.name);
  constructor(
    private prisma: PrismaService,
    private callReportService: CallReportService,
    private taskTransformer: TaskTransformerService,
    private redisCache: RedisCacheService
  ) {}

  async getWorkerTasks(
    workerId: string,
    status?: string,
    page = 1,
    limit = 20,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedTasksResponseDto> {
    try {
      const cachedResult = await this.redisCache.getWorkerTasksCached(
        workerId,
        status,
        page,
        limit,
        sortBy,
        sortOrder
      );

      if (cachedResult) {
        const transformedTasks = this.taskTransformer.transformTasks(
          cachedResult.data
        );
        return {
          data: transformedTasks,
          meta: cachedResult.meta,
        };
      }
    } catch (error) {
      this.logger.warn(
        'Redis cache failed, falling back to database:',
        getErrorMessage(error)
      );
    }

    const result = await this.getTasksFromDatabase(
      workerId,
      status,
      page,
      limit,
      sortBy,
      sortOrder
    );

    try {
      this.logger.log(
        `🔄 Rebuilding summary cache for worker ${workerId} after database fetch`
      );

      await this.redisCache.invalidateWorkerTaskCache(workerId);

      const freshSummary = await this.getWorkerTaskSummary(workerId);
      this.logger.log(
        `Summary cache rebuilt for worker ${workerId}: ${JSON.stringify(freshSummary)}`
      );
    } catch (error) {
      this.logger.warn(
        `Failed to rebuild summary cache for worker ${workerId}:`,
        getErrorMessage(error)
      );
    }

    return result;
  }

  private async getTasksFromDatabase(
    workerId: string,
    status?: string,
    page = 1,
    limit = 20,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedTasksResponseDto> {
    const where: any = { assignedUserId: workerId };

    if (status) {
      const statusArray = status
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) =>
          [
            'unassigned',
            'assigned',
            'accepted',
            'rejected',
            'completed',
          ].includes(s as string)
        );

      if (statusArray.length > 0) {
        // Map to the real enum values when possible, otherwise use the string values
        where.status = {
          in: statusArray.map((s) => (RealTaskStatus ? RealTaskStatus[s] : s)),
        };
      }
    }

    const total = await this.prisma.task.count({ where });

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: this.taskTransformer.getStandardSelect(),
    });

    const transformedTasks = this.taskTransformer.transformTasks(tasks);

    return {
      data: transformedTasks,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  async refreshWorkerSummaryCache(
    workerId: string
  ): Promise<TaskSummaryResponseDto> {
    this.logger.log(`🔄 Force refreshing summary cache for worker ${workerId}`);

    await this.redisCache.invalidateWorkerTaskCache(workerId);

    const freshSummary = await this.getWorkerTaskSummary(workerId);

    this.logger.log(
      `Summary cache refreshed for worker ${workerId}: ${JSON.stringify(freshSummary)}`
    );
    return freshSummary;
  }

  async getWorkerTaskSummary(
    workerId: string
  ): Promise<TaskSummaryResponseDto> {
    try {
      const cachedSummary =
        await this.redisCache.getWorkerTaskSummaryCached(workerId);

      if (cachedSummary) {
        this.logger.log(
          `Worker ${workerId} summary from cache: ${JSON.stringify(cachedSummary)}`
        );
        return cachedSummary;
      }
    } catch (error) {
      this.logger.warn(
        `Cache error for worker ${workerId} summary:`,
        getErrorMessage(error)
      );
    }

    this.logger.log(
      ` Cache miss for worker ${workerId} summary - fetching from DB and rebuilding cache`
    );

    const statuses = RealTaskStatus
      ? [
          RealTaskStatus.assigned,
          RealTaskStatus.accepted,
          RealTaskStatus.completed,
          RealTaskStatus.rejected,
        ]
      : ['assigned', 'accepted', 'completed', 'rejected'];

    const counts = await Promise.all(
      statuses.map((status) =>
        this.prisma.task.count({
          where: { assignedUserId: workerId, status },
        })
      )
    );

    const summary = {
      unassigned: 0,
      assigned: counts[0] ?? 0,
      accepted: counts[1] ?? 0,
      completed: counts[2] ?? 0,
      rejected: counts[3] ?? 0,
      total: counts.reduce((a, b) => a + (b ?? 0), 0),
    };

    try {
      await this.redisCache.set(
        `worker:summary:${workerId}`,
        JSON.stringify(summary),
        9000
      );
      this.logger.log(`Worker ${workerId} summary cache rebuilt from database`);
    } catch (error) {
      this.logger.error(
        `Failed to rebuild cache for worker ${workerId}:`,
        getErrorMessage(error)
      );
    }

    return summary;
  }

  async acceptTask(taskId: string, workerId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Task not found');

    if (task.assignedUserId !== workerId) {
      throw new ForbiddenException('You cannot accept this task');
    }

    const oldStatus = task.status;
    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'accepted' },
    });

    try {
      await this.redisCache.updateTaskInWorkerCacheNew(workerId, taskId, {
        status: 'accepted',
        updatedAt: new Date().toISOString(),
      });

      await this.redisCache.updateWorkerTaskSummaryCacheWithStatus(workerId, {
        oldStatus: oldStatus,
        newStatus: 'accepted',
        taskId: taskId,
      });

      await this.redisCache.invalidateWorkerTaskCache(workerId, taskId);

      await this.redisCache.updateWorkerTaskSummaryCache(workerId, {
        oldStatus: oldStatus,
        newStatus: 'accepted',
      });

      this.logger.log(`Task ${taskId} status changed: ${oldStatus} → accepted`);
      this.logger.log(`Worker ${workerId} cache updated with status change`);
    } catch (error) {
      this.logger.error(
        `Cache update failed for task ${taskId} status change:`,
        getErrorMessage(error)
      );
    }

    return updatedTask;
  }

  async rejectTask(taskId: string, workerId: string, reason: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Task not found');

    if (task.assignedUserId !== workerId) {
      throw new ForbiddenException('You cannot reject this task');
    }

    const oldStatus = task.status;

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'rejected' },
    });

    await this.prisma.taskRejection.create({
      data: {
        taskId,
        userId: workerId,
        reason,
      },
    });

    try {
      await this.redisCache.updateTaskInWorkerCacheNew(workerId, taskId, {
        status: 'rejected',
        updatedAt: new Date().toISOString(),
        rejectionReason: reason,
      });

      await this.redisCache.updateWorkerTaskSummaryCacheWithStatus(workerId, {
        oldStatus: oldStatus,
        newStatus: 'rejected',
        taskId: taskId,
      });

      await this.redisCache.invalidateWorkerTaskCache(workerId, taskId);

      await this.redisCache.updateWorkerTaskSummaryCache(workerId, {
        oldStatus: oldStatus,
        newStatus: 'rejected',
      });

      this.logger.log(`Task ${taskId} status changed: ${oldStatus} → rejected`);
      this.logger.log(`Worker ${workerId} cache updated with status change`);
      this.logger.log(`Rejection reason: ${reason}`);
    } catch (error) {
      this.logger.error(
        `Cache update failed for task ${taskId} status change:`,
        getErrorMessage(error)
      );
    }

    return updatedTask;
  }

  async completeTask(taskId: string, workerId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Task not found');

    if (task.assignedUserId !== workerId) {
      throw new ForbiddenException('You cannot complete this task');
    }

    const oldStatus = task.status;

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed' },
    });

    await this.callReportService.dismissAllCallsForTask(taskId);

    try {
      await this.redisCache.updateTaskInWorkerCacheNew(workerId, taskId, {
        status: 'completed',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      await this.redisCache.updateWorkerTaskSummaryCacheWithStatus(workerId, {
        oldStatus: oldStatus,
        newStatus: 'completed',
        taskId: taskId,
      });

      await this.redisCache.invalidateWorkerTaskCache(workerId, taskId);

      await this.redisCache.updateWorkerTaskSummaryCache(workerId, {
        oldStatus: oldStatus,
        newStatus: 'completed',
      });

      this.logger.log(
        `Task ${taskId} status changed: ${oldStatus} → completed`
      );
      this.logger.log(`Worker ${workerId} cache updated with status change`);
      this.logger.log(`Call reports dismissed for task ${taskId}`);

      const now = new Date();
      const yearsToInvalidate = new Set<number>([now.getUTCFullYear()]);

      const updatedYear = new Date(updatedTask.updatedAt).getUTCFullYear();
      yearsToInvalidate.add(updatedYear);
      for (const y of yearsToInvalidate) {
        await this.redisCache.del(`admin:stats:monthly:${y}`);
      }
    } catch (error) {
      this.logger.error(
        `Cache update failed for task ${taskId} status change:`,
        getErrorMessage(error)
      );
    }

    return updatedTask;
  }

  async getRejectedTasks(
    workerId: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedTasksResponseDto> {
    const where: any = {
      assignedUserId: workerId,
      status: RealTaskStatus ? RealTaskStatus.rejected : 'rejected',
    };

    const total = await this.prisma.task.count({ where });

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: this.taskTransformer.getStandardSelect(),
    });

    const transformedTasks = this.taskTransformer.transformTasks(tasks);

    return {
      data: transformedTasks,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  async acceptRejectedTask(taskId: string, workerId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        rejections: {
          where: { userId: workerId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.assignedUserId !== workerId) {
      throw new ForbiddenException('You cannot accept this task');
    }

    if (task.status !== 'rejected') {
      throw new ForbiddenException('Task is not rejected');
    }

    const workerRejection = task.rejections.find(
      (rej) => rej.userId === workerId
    );
    if (!workerRejection) {
      throw new ForbiddenException('You have not rejected this task');
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'accepted',
        updatedAt: new Date(),
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    await this.redisCache.invalidateWorkerTaskCache(workerId, taskId);

    await this.redisCache.updateWorkerTaskSummaryCache(workerId, {
      oldStatus: 'rejected',
      newStatus: 'accepted',
    });

    return updatedTask;
  }
}
