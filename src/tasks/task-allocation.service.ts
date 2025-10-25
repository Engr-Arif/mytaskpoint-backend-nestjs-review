import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User, Task } from '@prisma/client';
import { getErrorMessage } from '../common/utils/error.util';
import { CacheService } from '../common/services/cache.service';
import { RedisCacheService } from '../common/services/redis-cache.service';
import { TaskTransformerService } from './services/task-transformer.service';
import { SpatialIndexService } from './services/spatial-index.service';
import { PerformanceMonitorService } from './services/performance-monitor.service';
import { AdvancedCacheService } from './services/advanced-cache.service';
import { TaskResponseDto } from './dtos/task-response.dto';
import { haversineDistance } from '../common/utils/geo';

// Local helper types for clarity
interface WorkerPoint {
  data: User;
  distance?: number;
}

interface Allocation {
  taskId: string;
  workerId: string;
  distance?: number;
}

@Injectable()
export class TaskAllocationService {
  private readonly logger = new Logger(TaskAllocationService.name);
  private readonly MAX_TASKS_PER_WORKER = 50;
  private readonly MAX_ALLOCATION_RADIUS = 10;

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private redisCache: RedisCacheService,
    private taskTransformer: TaskTransformerService,
    private spatialIndex: SpatialIndexService,
    private performanceMonitor: PerformanceMonitorService,
    private advancedCache: AdvancedCacheService
  ) {}
  async getUnassignedTasks(): Promise<TaskResponseDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: { status: 'unassigned' },
      orderBy: { createdAt: 'asc' },
      select: this.taskTransformer.getStandardSelect(),
    });

    return this.taskTransformer.transformTasks(tasks);
  }

  // Get current task count for a worker

  private async getWorkerCurrentTaskCount(workerId: string): Promise<number> {
    try {
      const count = await this.prisma.task.count({
        where: {
          assignedUserId: workerId,
          status: { in: ['assigned', 'accepted'] },
        },
      });
      return count;
    } catch (error) {
      this.logger.error(
        `Failed to get task count for worker ${workerId}:`,
        getErrorMessage(error)
      );
      return 0;
    }
  }

  //Check if worker can accept more tasks

  private async canWorkerAcceptTask(workerId: string): Promise<boolean> {
    const currentTasks = await this.getWorkerCurrentTaskCount(workerId);
    return currentTasks < this.MAX_TASKS_PER_WORKER;
  }

  // Get worker task counts in batch for better performance

  private async getWorkerTaskCountsBatch(
    workerIds: string[]
  ): Promise<Record<string, number>> {
    try {
      const counts = await this.prisma.task.groupBy({
        by: ['assignedUserId'],
        where: {
          assignedUserId: { in: workerIds },
          status: { in: ['assigned', 'accepted'] },
        },
        _count: {
          id: true,
        },
      });

      const result: Record<string, number> = {};
      workerIds.forEach((id) => (result[id] = 0));

      counts.forEach((count) => {
        if (count.assignedUserId && count._count?.id) {
          result[count.assignedUserId] = count._count.id;
        }
      });

      return result;
    } catch (error) {
      this.logger.error(
        'Failed to get worker task counts batch:',
        getErrorMessage(error)
      );
      return workerIds.reduce((acc, id) => ({ ...acc, [id]: 0 }), {});
    }
  }

  //Optimized worker selection algorithm

  private selectBestWorkerOptimized(
    nearbyWorkers: WorkerPoint[],
    workerTaskCounts: Record<string, number>,
    task: Task
  ): { worker: User; distance: number } | null {
    let bestWorker: any = null;
    let bestScore = -1;
    let bestDistance = Infinity;

    for (const workerPoint of nearbyWorkers) {
      const worker = workerPoint.data;
      const currentTasks = workerTaskCounts[worker.id] || 0;

      if (currentTasks >= this.MAX_TASKS_PER_WORKER) continue;

      const distance =
        typeof workerPoint.distance === 'number'
          ? workerPoint.distance
          : typeof task.lat === 'number' &&
              typeof task.lon === 'number' &&
              typeof worker.lat === 'number' &&
              typeof worker.lon === 'number'
            ? haversineDistance(task.lat, task.lon, worker.lat, worker.lon)
            : Infinity;

      const score = this.calculateWorkerScore(
        distance,
        currentTasks,
        this.MAX_TASKS_PER_WORKER
      );

      if (score > bestScore) {
        bestScore = score;
        bestWorker = worker;
        bestDistance = distance;
      }
    }

    return bestWorker ? { worker: bestWorker, distance: bestDistance } : null;
  }

  // Calculate worker score for selection

  private calculateWorkerScore(
    distance: number,
    currentTasks: number,
    maxTasks: number
  ): number {
    // distance is expected in kilometers; scale into a 0-100 score where
    // larger distances reduce the score. We divide by 10 to normalize.
    const distanceScore = Math.max(0, 100 - distance / 10);

    // Load score gives preference to workers with fewer current tasks.
    // Scale to 0-50 so distance has slightly higher weight than load.
    const loadScore = (1 - currentTasks / maxTasks) * 50;

    return distanceScore + loadScore;
  }

  // Bulk update task allocations

  /**
   * Perform guarded bulk updates: only update a task if it is still unassigned.
   * Returns an array of taskIds that were actually updated. This prevents
   * double-assignment in presence of concurrent allocation workers.
   */
  private async bulkUpdateTaskAllocations(
    allocations: Allocation[]
  ): Promise<string[]> {
    const successful: string[] = [];

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const allocation of allocations) {
          // Use updateMany with a status guard so the call is idempotent
          const result = await tx.task.updateMany({
            where: { id: allocation.taskId, status: 'unassigned' },
            data: {
              assignedUserId: allocation.workerId,
              status: 'assigned',
              assignedAt: new Date(),
            },
          });

          if (result.count && result.count > 0) {
            successful.push(allocation.taskId);
          }
        }
      });

      return successful;
    } catch (error) {
      this.logger.error(
        'Failed to bulk update task allocations:',
        getErrorMessage(error)
      );
      throw error;
    }
  }

  // Invalidate worker caches with proper summary updates

  private async invalidateWorkerCaches(
    workerIds: string[],
    workerTaskCounts?: Record<string, number>
  ): Promise<void> {
    try {
      await Promise.all(
        workerIds.map(async (workerId) => {
          await this.redisCache.invalidateWorkerTaskCache(workerId);

          if (workerTaskCounts && (workerTaskCounts[workerId] ?? 0) > 0) {
            if (
              this.redisCache &&
              typeof this.redisCache.updateWorkerTaskSummaryCacheBulk ===
                'function'
            ) {
              await this.redisCache.updateWorkerTaskSummaryCacheBulk(workerId, {
                assigned: workerTaskCounts[workerId] ?? 0,
              });
            } else {
              // Fallback for environments/mocks that only provide single update
              await this.redisCache.updateWorkerTaskSummaryCache(workerId, {
                newStatus: 'assigned',
              });
            }
          } else {
            await this.redisCache.updateWorkerTaskSummaryCache(workerId, {
              oldStatus: 'unassigned',
              newStatus: 'assigned',
            });
          }
        })
      );
    } catch (error) {
      this.logger.error(
        'Failed to invalidate worker caches:',
        getErrorMessage(error)
      );
    }
  }

  // Calculate average distance for allocated tasks

  private calculateAverageDistance(
    allocations: Array<{ taskId: string; workerId: string; distance?: number }>,
    _tasks: Task[]
  ): number {
    if (allocations.length === 0) return 0;

    let totalDistance = 0;
    let validAllocations = 0;

    for (const allocation of allocations) {
      if (typeof allocation.distance === 'number' && allocation.distance >= 0) {
        totalDistance += allocation.distance;
        validAllocations++;
      }
    }

    return validAllocations > 0 ? totalDistance / validAllocations : 0;
  }

  //Calculate worker utilization percentage

  private calculateWorkerUtilization(
    workers: User[],
    workerTaskCounts: Record<string, number>
  ): number {
    if (workers.length === 0) return 0;

    let totalUtilization = 0;
    let validWorkers = 0;

    for (const worker of workers) {
      const currentTasks = workerTaskCounts[worker.id] || 0;
      const utilization = currentTasks / this.MAX_TASKS_PER_WORKER; // 100;
      totalUtilization += utilization;
      validWorkers++;
    }

    return validWorkers > 0 ? totalUtilization / validWorkers : 0;
  }

  // Get performance statistics

  async getPerformanceStats(): Promise<any> {
    return this.performanceMonitor.getPerformanceStats(
      'allocateTasksOptimized'
    );
  }

  // Get allocation trends

  async getAllocationTrends(): Promise<any> {
    return this.performanceMonitor.getAllocationTrends();
  }

  // Get cache statistics

  async getCacheStats(): Promise<any> {
    return this.advancedCache.getCacheStats();
  }

  // Optimized task allocation with spatial indexing

  async allocateTasksOptimized(batchSize = 100) {
    const operationId = this.performanceMonitor.startOperation(
      'allocateTasksOptimized',
      { batchSize }
    );

    try {
      this.logger.log(
        `Starting optimized task allocation with batch size: ${batchSize}`
      );
      const startTime = Date.now();

      const [tasks, workers] = await Promise.all([
        this.prisma.task.findMany({
          where: { geocodePending: false, status: 'unassigned' },
          orderBy: { createdAt: 'asc' },
          take: batchSize,
        }),
        this.cacheService.getWorkers(),
      ]);

      if (!tasks.length || !workers.length) {
        this.logger.log(
          `No tasks (${tasks.length}) or workers (${workers.length}) found`
        );
        return {
          message: 'No tasks or workers found',
          totalTasks: tasks.length,
          allocated: 0,
          allocationFailed: tasks.length,
        };
      }

      this.logger.log(
        `Found ${tasks.length} tasks and ${workers.length} workers for allocation`
      );

      this.spatialIndex.buildSpatialIndex(workers);
      const spatialStats = this.spatialIndex.getStats();
      this.logger.log(
        `Spatial index built: ${spatialStats.totalWorkers} workers in ${spatialStats.gridCells} cells`
      );

      const cacheVersion = Date.now();
      await this.advancedCache.cacheWorkersWithSpatialIndex(workers);
      await this.advancedCache.cacheSpatialIndexStats({
        ...spatialStats,
        timestamp: Date.now(),
      });

      await this.advancedCache.syncCacheWithVersion(
        'workers:spatial_index',
        workers,
        cacheVersion
      );

      const workerTaskCounts = await this.getWorkerTaskCountsBatch(
        workers.map((w) => w.id)
      );

      let allocatedCount = 0;
      let allocationFailedCount = 0;
      const affectedWorkers = new Set<string>();
      const allocations: Array<{
        taskId: string;
        workerId: string;
        distance?: number;
      }> = [];

      for (const task of tasks) {
        if (!task.lat || !task.lon) {
          allocationFailedCount++;
          continue;
        }

        const nearbyWorkers = this.spatialIndex.findNearbyWorkers(
          task.lat,
          task.lon,
          this.MAX_ALLOCATION_RADIUS
        );

        // spatialIndex returns SpatialPoint[] where `data` is unknown.
        // Convert to WorkerPoint[] by asserting `data` is a `User`.
        const nearbyWorkerPoints: WorkerPoint[] = nearbyWorkers.map((sp) => ({
          data: sp.data as User,
        }));

        if (nearbyWorkers.length === 0) {
          allocationFailedCount++;
          continue;
        }

        const bestWorkerResult = this.selectBestWorkerOptimized(
          nearbyWorkerPoints,
          workerTaskCounts,
          task
        );

        if (bestWorkerResult) {
          const { worker: chosenWorker, distance } = bestWorkerResult;
          allocations.push({
            taskId: task.id,
            workerId: chosenWorker.id,
            distance,
          });
          // Defer incrementing workerTaskCounts/allocatedCount until DB update succeeds
        } else {
          allocationFailedCount++;
        }
      }

      // Perform guarded bulk update, then reconcile counts using only successful updates
      let successfulAllocations: Allocation[] = [];
      if (allocations.length > 0) {
        const successfulIds = await this.bulkUpdateTaskAllocations(allocations);
        const allocationMap = new Map<string, Allocation>();
        for (const a of allocations) allocationMap.set(a.taskId, a);
        successfulAllocations = successfulIds
          .map((id) => allocationMap.get(id))
          .filter(Boolean) as Allocation[];

        // Reconcile counts based on successful allocations
        allocatedCount = successfulAllocations.length;
        allocationFailedCount +=
          allocations.length - successfulAllocations.length;

        // Update worker task counts and affected workers only for successful allocations
        for (const a of successfulAllocations) {
          workerTaskCounts[a.workerId] =
            (workerTaskCounts[a.workerId] || 0) + 1;
          affectedWorkers.add(a.workerId);
        }
      }

      if (affectedWorkers.size > 0) {
        await this.invalidateWorkerCaches(
          Array.from(affectedWorkers),
          workerTaskCounts
        );
      }

      const duration = Date.now() - startTime;
      const successRate =
        tasks.length > 0 ? (allocatedCount / tasks.length) * 100 : 0;

      const avgDistance = this.calculateAverageDistance(
        // Use only successful allocations when measuring distance
        successfulAllocations.length > 0 ? successfulAllocations : allocations,
        tasks
      );
      const workerUtilization = this.calculateWorkerUtilization(
        workers,
        workerTaskCounts
      );

      const allocationMetrics = {
        totalTasks: tasks.length,
        allocated: allocatedCount,
        failed: allocationFailedCount,
        successRate: successRate,
        duration: duration,
        spatialIndexStats: spatialStats,
        avgDistance: avgDistance,
        workerUtilization: workerUtilization,
      };

      this.performanceMonitor.recordAllocationMetrics(allocationMetrics);
      await this.advancedCache.cacheAllocationResults({
        ...allocationMetrics,
        timestamp: Date.now(),
      });

      this.logger.log(
        `Optimized task allocation completed in ${duration}ms - total: ${tasks.length}, allocated: ${allocatedCount}, failed: ${allocationFailedCount}, successRate: ${successRate.toFixed(2)}%, affectedWorkers: ${affectedWorkers.size}`
      );

      this.performanceMonitor.endOperation(operationId, true, {
        allocationMetrics,
      });

      return {
        message: 'Optimized task allocation completed',
        totalTasks: tasks.length,
        allocated: allocatedCount,
        allocationFailed: allocationFailedCount,
        affectedWorkers: affectedWorkers.size,
        successRate: successRate,
        duration: duration,
        spatialIndexStats: spatialStats,
        avgDistance: avgDistance,
        workerUtilization: workerUtilization,
      };
    } catch (error: unknown) {
      this.logger.error(
        'Optimized task allocation failed:',
        getErrorMessage(error)
      );
      this.performanceMonitor.endOperation(operationId, false, {
        error: getErrorMessage(error),
      });
      throw new BadRequestException(
        `Optimized task allocation failed: ${getErrorMessage(error)}`
      );
    }
  }

  // Legacy allocation method (kept for backward compatibility)

  async allocateTasks(batchSize = 100) {
    try {
      this.logger.log(`Starting task allocation with batch size: ${batchSize}`);
      const startTime = Date.now();

      const tasks: Task[] = await this.prisma.task.findMany({
        where: { geocodePending: false, status: 'unassigned' },
        orderBy: { createdAt: 'asc' },
      });

      const workers = await this.cacheService.getWorkers();

      if (!tasks.length || !workers.length) {
        this.logger.log(
          `No tasks (${tasks.length}) or workers (${workers.length}) found`
        );
        return {
          message: 'No tasks or workers found',
          totalTasks: tasks.length,
          allocated: 0,
          allocationFailed: tasks.length,
        };
      }

      this.logger.log(
        `Found ${tasks.length} tasks and ${workers.length} workers for allocation`
      );

      const workerLoad: Record<string, number> = {};
      for (const worker of workers) workerLoad[worker.id] = 0;

      let allocatedCount = 0;
      let allocationFailedCount = 0;
      const affectedWorkers = new Set<string>();

      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);

        const updates = await Promise.all(
          batch.map(async (task) => {
            let nearestWorker: User | null = null;
            let minDist = Infinity;

            for (const worker of workers) {
              if (!task.lat || !task.lon || !worker.lat || !worker.lon)
                continue;

              const dist = haversineDistance(
                task.lat,
                task.lon,
                worker.lat,
                worker.lon
              );

              if (dist <= this.MAX_ALLOCATION_RADIUS) {
                const currentTaskCount = await this.getWorkerCurrentTaskCount(
                  worker.id
                );
                if (currentTaskCount >= this.MAX_TASKS_PER_WORKER) {
                  continue;
                }

                if (!nearestWorker) {
                  nearestWorker = worker;
                  minDist = dist;
                } else if (dist < minDist) {
                  nearestWorker = worker;
                  minDist = dist;
                } else if (
                  Math.abs(dist - minDist) < 0.1 &&
                  (workerLoad[worker.id] ?? Infinity) <
                    (workerLoad[nearestWorker.id] ?? Infinity)
                ) {
                  nearestWorker = worker;
                  minDist = dist;
                }
              }
            }

            if (nearestWorker) {
              workerLoad[nearestWorker.id] =
                (workerLoad[nearestWorker.id] ?? 0) + 1;
              allocatedCount += 1;
              affectedWorkers.add(nearestWorker.id);
              return this.prisma.task.update({
                where: { id: task.id },
                data: {
                  assignedUserId: nearestWorker.id,
                  status: 'assigned',
                  assignedAt: new Date(),
                },
              });
            } else {
              allocationFailedCount += 1;
            }

            return null;
          })
        );

        await Promise.all(updates.filter(Boolean));
      }

      if (affectedWorkers.size > 0) {
        this.logger.log(
          `Invalidating cache for ${affectedWorkers.size} workers after bulk allocation`
        );
        await Promise.all(
          Array.from(affectedWorkers).map(async (workerId) => {
            const actualTasksAssigned = workerLoad[workerId] || 0;

            this.logger.log(
              `Worker ${workerId} received ${actualTasksAssigned} tasks in bulk allocation`
            );

            await this.redisCache.invalidateWorkerTaskCache(workerId);

            if (
              this.redisCache &&
              typeof this.redisCache.updateWorkerTaskSummaryCacheBulk ===
                'function'
            ) {
              await this.redisCache.updateWorkerTaskSummaryCacheBulk(workerId, {
                assigned: actualTasksAssigned,
              });
            } else {
              await this.redisCache.updateWorkerTaskSummaryCache(workerId, {
                newStatus: 'assigned',
              });
            }
          })
        );
      }

      const duration = Date.now() - startTime;
      const successRate =
        tasks.length > 0 ? (allocatedCount / tasks.length) * 100 : 0;

      this.logger.log(
        `Task allocation completed in ${duration}ms - total:${tasks.length} allocated:${allocatedCount} failed:${allocationFailedCount} successRate:${successRate.toFixed(2)}% affectedWorkers:${affectedWorkers.size}`
      );

      return {
        message: 'Task allocation completed',
        totalTasks: tasks.length,
        allocated: allocatedCount,
        allocationFailed: allocationFailedCount,
        notAllocated: allocationFailedCount,
        affectedWorkers: affectedWorkers.size,
        successRate: successRate,
        duration: duration,
      };
    } catch (error: unknown) {
      this.logger.error('Task allocation failed:', getErrorMessage(error));
      throw new BadRequestException(
        `Task allocation failed: ${getErrorMessage(error)}`
      );
    }
  }

  async deleteUnassignedTasks(ids: string[], chunkSize = 500) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs must be a non-empty array');
    }

    let totalDeleted = 0;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { count } = await this.prisma.task.deleteMany({
        where: {
          id: { in: chunk },
          status: 'unassigned',
        },
      });
      totalDeleted += count;
    }

    return {
      message: 'Selected unassigned tasks deleted successfully',
      totalDeleted,
    };
  }
}
