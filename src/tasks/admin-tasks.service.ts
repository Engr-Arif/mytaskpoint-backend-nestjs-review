import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';
import { CacheService } from '../common/services/cache.service';
import { RedisCacheService } from '../common/services/redis-cache.service';
import {
  loadTaskReallocationConfig,
  canReallocateTask,
  getReallocationErrorMessage,
} from '../config/task-reallocation.config';
import { TaskTransformerService } from './services/task-transformer.service';
import {
  PaginatedTasksResponseDto,
  TaskSummaryResponseDto,
} from './dtos/task-response.dto';
import { TaskSearchByLocationDto } from './dtos/task-search-by-location.dto';
import { TaskSearchDto } from './dtos/task-search.dto';

@Injectable()
export class AdminTasksService {
  private readonly logger = new Logger(AdminTasksService.name);
  private readonly reallocationConfig = loadTaskReallocationConfig();

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private redisCache: RedisCacheService,
    private taskTransformer: TaskTransformerService
  ) {}

  private async buildSummary(where: any): Promise<TaskSummaryResponseDto> {
    const statuses: TaskStatus[] = [
      TaskStatus.unassigned,
      TaskStatus.assigned,
      TaskStatus.accepted,
      TaskStatus.completed,
      TaskStatus.rejected,
    ];

    const counts = await Promise.all(
      statuses.map((status) =>
        this.prisma.task.count({ where: { ...where, status } })
      )
    );

    return {
      unassigned: counts[0] ?? 0,
      assigned: counts[1] ?? 0,
      accepted: counts[2] ?? 0,
      completed: counts[3] ?? 0,
      rejected: counts[4] ?? 0,
      total: counts.reduce((a, b) => a + (b ?? 0), 0),
    };
  }

  async getGlobalTaskSummary() {
    return this.buildSummary({});
  }

  async manuallyAssignTask(taskId: string, userId: string, _adminId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new BadRequestException('Task not found');
    }

    if (
      task.status !== TaskStatus.unassigned &&
      task.status !== TaskStatus.rejected
    ) {
      throw new BadRequestException('Task is already assigned or completed');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.role !== 'WORKER') {
      throw new BadRequestException('User must be a worker');
    }

    if (!user.active) {
      throw new BadRequestException('User is inactive');
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        assignedUserId: userId,
        status: TaskStatus.assigned,
        assignedAt: new Date(),
        updatedAt: new Date(),
      },
      select: this.taskTransformer.getStandardSelect(),
    });

    const transformedTask = this.taskTransformer.transformTask(updatedTask);

    try {
      await this.redisCache.invalidateWorkerTaskCache(userId, taskId);

      await this.redisCache.addTaskToWorkerCache(userId, transformedTask);

      this.logger.log(
        ` Admin Manual Assignment - Task ${taskId} assigned to Worker ${userId}`
      );
      this.logger.log(
        ` Redis Cache Updated - Worker ${userId} cache updated with task details`
      );
      this.logger.log(` Task Status: ${task.status} → assigned`);
      this.logger.log(` Worker Info: ${user.fullName} (${user.email})`);
    } catch (error) {
      this.logger.error(
        ` Redis Cache Update Failed for Worker ${userId}:`,
        error
      );
    }

    return {
      message: 'Task assigned successfully',
      task: transformedTask,
      cacheUpdated: true,
    };
  }

  async reallocateTask(taskId: string, userId: string, _adminId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        rejections: {
          select: {
            reason: true,
            createdAt: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });

    if (!task) {
      throw new BadRequestException('Task not found');
    }

    if (!canReallocateTask(task.status, this.reallocationConfig)) {
      const errorMessage = getReallocationErrorMessage(
        task.status,
        this.reallocationConfig
      );
      throw new BadRequestException(errorMessage);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.role !== 'WORKER') {
      throw new BadRequestException('User must be a worker');
    }

    if (!user.active) {
      throw new BadRequestException('User is inactive');
    }

    const previousAssignee = task.assignedUser
      ? {
          id: task.assignedUser.id,
          name: task.assignedUser.fullName,
          email: task.assignedUser.email,
        }
      : null;

    const previousStatus = task.status;

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        assignedUserId: userId,
        status: TaskStatus.assigned,
        assignedAt: new Date(),
        updatedAt: new Date(),
      },
      select: this.taskTransformer.getStandardSelect(),
    });

    const transformedTask = this.taskTransformer.transformTask(updatedTask);

    try {
      if (task.assignedUserId && task.assignedUserId !== userId) {
        this.logger.log(
          `🔄 Reallocation - Removing task ${taskId} from previous worker ${task.assignedUserId}`
        );

        await this.redisCache.removeTaskFromWorkerCache(
          task.assignedUserId,
          taskId
        );

        await this.redisCache.updateWorkerTaskSummaryCache(
          task.assignedUserId,
          {
            oldStatus: previousStatus,
            newStatus: 'unassigned',
          }
        );

        this.logger.log(
          ` Previous Worker Cache Updated - Worker ${task.assignedUserId} cache cleared of task ${taskId}`
        );
      }

      this.logger.log(
        `🔄 Reallocation - Adding task ${taskId} to new worker ${userId}`
      );

      await this.redisCache.invalidateWorkerTaskCache(userId, taskId);

      await this.redisCache.addTaskToWorkerCache(userId, transformedTask);

      this.logger.log(
        ` New Worker Cache Updated - Worker ${userId} cache updated with task ${taskId}`
      );

      this.logger.log(` Admin Reallocation Complete - Task ${taskId}`);
      this.logger.log(
        ` Previous Worker: ${previousAssignee ? `${previousAssignee.name} (${previousAssignee.email})` : 'None'}`
      );
      this.logger.log(` New Worker: ${user.fullName} (${user.email})`);
      this.logger.log(` Status Change: ${previousStatus} → assigned`);
      this.logger.log(
        ` Redis Cache: Previous worker cleared, new worker updated`
      );
    } catch (error) {
      this.logger.error(
        ` Redis Cache Update Failed during reallocation:`,
        error
      );
    }

    return {
      message: 'Task reallocated successfully',
      task: transformedTask,
      previousWorker: previousAssignee,
      newWorker: {
        id: user.id,
        name: user.fullName,
        email: user.email,
      },
      statusChange: `${previousStatus} → assigned`,
      cacheUpdated: true,
    };
  }

  async getTasksByStatus({
    status,
    page,
    limit,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
  }: {
    status: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedTasksResponseDto> {
    if (!Object.values(TaskStatus).includes(status as TaskStatus)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where: { status: status as TaskStatus },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        select: this.taskTransformer.getStandardSelect(),
      }),
      this.prisma.task.count({ where: { status: status as TaskStatus } }),
    ]);

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

  async getTasksByUser({
    publicId,
    status,
    page,
    limit,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
  }: {
    publicId: number;
    status?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedTasksResponseDto> {
    this.logger.log(
      `Getting tasks for user publicId: ${publicId}, status: ${status || 'all'}, page: ${page}, limit: ${limit}`
    );

    if (page < 1) {
      throw new BadRequestException('Page number must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    if (status) {
      const validStatuses = Object.values(TaskStatus);
      if (!validStatuses.includes(status as TaskStatus)) {
        throw new BadRequestException(
          `Invalid status: ${status}. Valid statuses are: ${validStatuses.join(', ')}`
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { publicId: publicId },
      select: {
        id: true,
        publicId: true,
        fullName: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      this.logger.error(`User not found with publicId: ${publicId}`);
      throw new BadRequestException(
        `User not found with publicId: ${publicId}`
      );
    }

    this.logger.log(
      `User found: ${user.fullName} (${user.email}), publicId: ${user.publicId}, role: ${user.role}, active: ${user.active}`
    );

    if (user.role !== 'WORKER') {
      this.logger.error(
        `User is not a worker: publicId ${publicId}, role: ${user.role}`
      );
      throw new BadRequestException(
        `User must be a worker. Current role: ${user.role}`
      );
    }

    if (!user.active) {
      this.logger.error(
        `User is inactive: publicId ${publicId}, active: ${user.active}`
      );
      throw new BadRequestException(
        `User account is inactive. Please activate the user first.`
      );
    }

    const where: any = { assignedUserId: user.id };

    if (status) {
      where.status = status as TaskStatus;
    }

    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        select: this.taskTransformer.getStandardSelect(),
      }),
      this.prisma.task.count({ where }),
    ]);

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

  async getUserTaskSummary(publicId: number): Promise<TaskSummaryResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { publicId: publicId },
      select: {
        id: true,
        publicId: true,
        fullName: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      throw new BadRequestException(
        `User not found with publicId: ${publicId}`
      );
    }

    if (user.role !== 'WORKER') {
      throw new BadRequestException(
        `User must be a worker. Current role: ${user.role}`
      );
    }

    if (!user.active) {
      throw new BadRequestException(
        `User account is inactive. Please activate the user first.`
      );
    }

    return this.buildSummary({ assignedUserId: user.id });
  }

  async debugUser(publicId: number) {
    this.logger.log(`Debugging user with publicId: ${publicId}`);

    const user = await this.prisma.user.findUnique({
      where: { publicId: publicId },
      select: {
        id: true,
        publicId: true,
        fullName: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return {
        exists: false,
        publicId,
        message: 'User not found in database',
      };
    }

    const taskCount = await this.prisma.task.count({
      where: { assignedUserId: user.id },
    });

    const canAccessTasks = user.role === 'WORKER' && user.active;
    let message = '';

    if (user.role !== 'WORKER') {
      message = `User role is ${user.role}, must be WORKER`;
    } else if (!user.active) {
      message = 'User account is inactive, must be active to access tasks';
    } else {
      message = 'User can access tasks';
    }

    return {
      exists: true,
      publicId,
      user: {
        id: user.id,
        publicId: user.publicId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      taskCount,
      canAccessTasks,
      message,
    };
  }

  async searchTasksByLocation(
    query: TaskSearchByLocationDto
  ): Promise<PaginatedTasksResponseDto> {
    this.logger.log(`Searching tasks by location: ${JSON.stringify(query)}`);

    if (!query.districtId && !query.territory) {
      throw new BadRequestException(
        'Either districtId or territory must be provided'
      );
    }

    if (query.districtId && query.territory) {
      throw new BadRequestException(
        'Cannot filter by both districtId and territory simultaneously'
      );
    }

    if (query.startDate && query.endDate) {
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);

      if (startDate > endDate) {
        throw new BadRequestException('Start date cannot be after end date');
      }
    }

    const where: any = {
      status: query.status,
    };

    if (query.districtId) {
      where.assignedUser = {
        district: query.districtId,
      };
    } else if (query.territory) {
      where.assignedUser = {
        territory: query.territory,
      };
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};

      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }

      if (query.endDate) {
        const endDate = new Date(query.endDate);
        endDate.setDate(endDate.getDate() + 1);
        where.createdAt.lt = endDate;
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    this.logger.log(`Search query where clause: ${JSON.stringify(where)}`);

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        select: this.taskTransformer.getStandardSelect(),
      }),
      this.prisma.task.count({ where }),
    ]);

    const transformedTasks = this.taskTransformer.transformTasks(tasks);

    this.logger.log(`Found ${total} tasks matching search criteria`);

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

  async searchTasks(
    searchDto: TaskSearchDto
  ): Promise<PaginatedTasksResponseDto> {
    const { phone, transactionId, page = 1, limit = 20 } = searchDto;

    if (!phone && !transactionId) {
      throw new BadRequestException(
        'At least one search parameter (phone or transactionId) must be provided'
      );
    }

    const where: any = {};

    if (phone) {
      where.phone = {
        contains: phone,
        mode: 'insensitive',
      };
    }

    if (transactionId) {
      where.transactionNumber = {
        contains: transactionId,
        mode: 'insensitive',
      };
    }

    const skip = (page - 1) * limit;

    const total = await this.prisma.task.count({ where });

    const tasks = await this.prisma.task.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
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

  async validateWorkerCache(workerId: string) {
    try {
      const worker = await this.prisma.user.findUnique({
        where: { id: workerId },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          active: true,
        },
      });

      if (!worker) {
        throw new BadRequestException('Worker not found');
      }

      const dbTaskCount = await this.prisma.task.count({
        where: { assignedUserId: workerId },
      });

      const dbSummary = await this.buildSummary({ assignedUserId: workerId });

      let cachedSummary = null;
      try {
        cachedSummary =
          await this.redisCache.getWorkerTaskSummaryCached(workerId);
      } catch {
        this.logger.warn(`Cache miss for worker ${workerId} summary`);
      }

      let cachedTasks: any = null;
      try {
        cachedTasks = await this.redisCache.getWorkerTasksCached(
          workerId,
          'all',
          1,
          20
        );
      } catch {
        this.logger.warn(`Cache miss for worker ${workerId} tasks`);
      }

      const summaryConsistent = cachedSummary
        ? JSON.stringify(cachedSummary) === JSON.stringify(dbSummary)
        : false;

      const taskCountConsistent = cachedTasks
        ? cachedTasks.meta.total === dbTaskCount
        : false;

      return {
        worker: {
          id: worker.id,
          name: worker.fullName,
          email: worker.email,
          role: worker.role,
          active: worker.active,
        },
        database: {
          taskCount: dbTaskCount,
          summary: dbSummary,
        },
        cache: {
          summary: cachedSummary,
          tasks: cachedTasks
            ? {
                total: cachedTasks.meta.total,
                page: cachedTasks.meta.page,
                dataCount: cachedTasks.data.length,
              }
            : null,
        },
        consistency: {
          summaryConsistent,
          taskCountConsistent,
          overallConsistent: summaryConsistent && taskCountConsistent,
        },
        recommendations: this.getCacheRecommendations(
          summaryConsistent,
          taskCountConsistent,
          cachedSummary,
          cachedTasks
        ),
      };
    } catch (error) {
      this.logger.error(
        `Error validating cache for worker ${workerId}:`,
        error
      );
      throw error;
    }
  }

  private getCacheRecommendations(
    summaryConsistent: boolean,
    taskCountConsistent: boolean,
    cachedSummary: any,
    cachedTasks: any
  ): string[] {
    const recommendations: string[] = [];

    if (!summaryConsistent) {
      recommendations.push(
        'Summary cache is inconsistent - consider refreshing'
      );
    }

    if (!taskCountConsistent) {
      recommendations.push(
        'Task count cache is inconsistent - consider refreshing'
      );
    }

    if (!cachedSummary) {
      recommendations.push(
        'Summary cache is missing - will be rebuilt on next access'
      );
    }

    if (!cachedTasks) {
      recommendations.push(
        'Tasks cache is missing - will be rebuilt on next access'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Cache is consistent and up-to-date');
    }

    return recommendations;
  }

  async refreshWorkerCache(workerId: string) {
    try {
      await this.redisCache.invalidateWorkerTaskCache(workerId);

      const freshSummary =
        await this.redisCache.getWorkerTaskSummaryCached(workerId);
      const freshTasks = await this.redisCache.getWorkerTasksCached(
        workerId,
        'all',
        1,
        20
      );

      this.logger.log(` Worker ${workerId} cache refreshed successfully`);

      return {
        message: 'Worker cache refreshed successfully',
        workerId,
        refreshedAt: new Date().toISOString(),
        summary: freshSummary,
        tasks: {
          total: freshTasks.meta.total,
          page: freshTasks.meta.page,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error refreshing cache for worker ${workerId}:`,
        error
      );
      throw error;
    }
  }

  async getRedisCacheStats() {
    try {
      const stats = await this.redisCache.getCacheStats();

      return {
        message: 'Redis cache statistics',
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error getting Redis cache stats:', error);
      throw error;
    }
  }

  async clearAllRedisCaches() {
    try {
      const result = await this.redisCache.clearAllCaches();

      this.logger.log(` All Redis caches cleared: ${result.cleared} keys`);

      return {
        message: 'All Redis caches cleared successfully',
        cleared: result.cleared,
        workerKeys: result.workerKeys,
        adminKeys: result.adminKeys,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error clearing Redis caches:', error);
      throw error;
    }
  }

  async getMonthlyTaskStatsByYear(year: number) {
    if (!Number.isInteger(year) || year < 1970 || year > 3000) {
      throw new BadRequestException('Invalid year');
    }

    const startOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    const cacheKey = `admin:stats:monthly:${year}`;
    try {
      const cached = await this.redisCache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      this.logger.warn(`Monthly stats cache read failed for year ${year}`);
    }

    const [createdThisYear, completedThisYear] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          createdAt: {
            gte: startOfYear,
            lt: startOfNextYear,
          },
        },
        select: { createdAt: true },
      }),
      this.prisma.task.findMany({
        where: {
          status: TaskStatus.completed,
          updatedAt: {
            gte: startOfYear,
            lt: startOfNextYear,
          },
        },
        select: { updatedAt: true },
      }),
    ]);

    const totals = Array(12).fill(0);
    const completed = Array(12).fill(0);

    for (const t of createdThisYear) {
      const m = new Date(t.createdAt).getUTCMonth();
      totals[m]++;
    }

    for (const t of completedThisYear) {
      const m = new Date(t.updatedAt).getUTCMonth();
      completed[m]++;
    }

    const response = {
      year,
      months: [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ],
      totals,
      completed,
    };

    try {
      await this.redisCache.set(cacheKey, JSON.stringify(response), 900);
    } catch {
      this.logger.warn(`Monthly stats cache write failed for year ${year}`);
    }

    return response;
  }
}
