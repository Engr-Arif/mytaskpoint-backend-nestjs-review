import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { getErrorMessage } from '../utils/error.util';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import type { TaskStatus } from '@prisma/client';

// Attempt to read runtime enum from generated Prisma client if present (non-throwing)
let RealTaskStatus: any = null;
// Prefer runtime global if present (e.g., test harness); otherwise leave null.
try {
  // Importing @prisma/client at compile-time can succeed after `prisma generate`.
  // Use the global Prisma runtime if available; failure is non-fatal.
  RealTaskStatus = (global as any).Prisma?.TaskStatus ?? null;
} catch {
  RealTaskStatus = null;
}

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    try {
      if (!process.env.REDIS_URL) {
        throw new Error('REDIS_URL environment variable is not set');
      }
      this.redis = new Redis(process.env.REDIS_URL);

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected successfully');
      });

      this.cleanupInterval = this.initializeMonitoring();
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  private readonly TASK_LIST_TTL = 18000;
  private readonly SUMMARY_TTL = 9000;
  private readonly ALL_TASKS_TTL = 18000;

  private cleanupInterval?: NodeJS.Timeout;

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.logger.log('Redis monitoring interval cleaned up');
    }
  }

  private initializeMonitoring(): NodeJS.Timeout {
    return setInterval(
      async () => {
        try {
          const info = await this.redis.info('memory');
          const memoryUsage = this.parseMemoryInfo(info);

          this.logger.log(
            `Cache Memory Usage: ${memoryUsage.used_memory_human} / ${memoryUsage.maxmemory_human}`
          );

          this.logger.log(
            `Circuit Breaker State: ${this.circuitBreaker.state}, Failures: ${this.circuitBreaker.failures}`
          );

          if (memoryUsage.used_memory_percentage > 70) {
            this.logger.warn(
              'High memory usage detected, cleaning up expired keys'
            );
            await this.cleanupExpiredKeys();
          }
        } catch (error) {
          this.logger.error('Error in monitoring:', getErrorMessage(error));
        }
      },
      5 * 60 * 1000
    );
  }

  private parseMemoryInfo(info: string): any {
    const lines = info.split('\r\n');
    const memoryInfo: Record<string, string> = {};

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (key) memoryInfo[String(key)] = String(value ?? '');
      }
    }

    return memoryInfo;
  }

  private async cleanupExpiredKeys() {
    try {
      const patterns = ['worker:tasks:*', 'worker:summary:*', 'admin:*'];
      let cleanedKeys = 0;
      let expiredKeys = 0;

      for (const pattern of patterns) {
        const keys = await this.getKeysByPattern(pattern);

        for (const key of keys) {
          const ttl = await this.redis.ttl(key);
          if (ttl === -1) {
            await this.redis.expire(key, this.TASK_LIST_TTL);
            cleanedKeys++;
          } else if (ttl === -2) {
            await this.redis.del(key);
            expiredKeys++;
          }
        }
      }

      this.logger.log(
        `Memory cleanup: ${cleanedKeys} keys got TTL, ${expiredKeys} expired keys removed`
      );
    } catch (error) {
      this.logger.error(
        'Error cleaning up expired keys:',
        getErrorMessage(error)
      );
    }
  }

  private async trackCacheMetrics(
    operation: string,
    duration: number,
    success: boolean
  ) {
    try {
      const key = `cache:metrics:${operation}`;
      const timestamp = Date.now();

      await this.redis.hincrby(key, success ? 'success' : 'failure', 1);
      await this.redis.hincrby(key, 'total_time', duration);
      await this.redis.hset(key, 'last_update', timestamp);
      await this.redis.expire(key, 86400);

      if (duration > 1000) {
        this.logger.warn(
          `Slow cache operation: ${operation} took ${duration}ms`
        );
      }
    } catch (error) {
      this.logger.error('Error tracking cache metrics:', error);
    }
  }

  /**
   * Cache admin tasks with pagination, filters, and sorting
   * NOTE: Admin tasks are no longer cached - always fetch fresh data
   * This method is kept for backward compatibility but not used
   */
  async getAdminTasksCached(
    status: string,
    territory?: string,
    page = 1,
    limit = 20,
    sortBy = 'updatedAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    const cacheKey = `admin:tasks:${status}:${territory || 'all'}:${page}:${limit}:${sortBy}:${sortOrder}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log(
          `Cache HIT for admin tasks - status: ${status}, territory: ${territory || 'all'}, page: ${page}, sort: ${sortBy}:${sortOrder}`
        );
        return JSON.parse(cached);
      }

      this.logger.log(
        `Cache MISS for admin tasks - fetching from DB with sort: ${sortBy}:${sortOrder}`
      );

      const where: any = { status };
      if (territory) {
        where.territory = territory;
      }

      const [tasks, total] = await Promise.all([
        this.prisma.task.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            title: true,
            address: true,
            lat: true,
            lon: true,
            status: true,
            geocodePending: true,
            errorLog: true,
            transactionNumber: true,
            requisitionDate: true,
            requisitionTime: true,
            customerName: true,
            phone: true,
            city: true,
            area: true,
            thana: true,
            orderStatus: true,
            lastStatusUpdate: true,
            productType: true,
            productName: true,
            unitPriceExVat: true,
            unitPriceIncVat: true,
            productCode: true,
            qty: true,
            mrp: true,
            invoiceAmount: true,
            paymentMode: true,
            deliveryPartner: true,
            assignedAt: true,
            createdAt: true,
            updatedAt: true,
            assignedUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                district: true,
                policeStation: true,
                area: true,
              },
            },
            territory: true,
          },
        }),
        this.prisma.task.count({ where }),
      ]);

      const result = {
        data: tasks,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };

      await this.redis.setex(
        cacheKey,
        this.TASK_LIST_TTL,
        JSON.stringify(result)
      );

      this.logger.log(
        `Cached admin tasks for status: ${status}, territory: ${territory || 'all'}, page: ${page}, sort: ${sortBy}:${sortOrder}`
      );
      return result;
    } catch (error) {
      this.logger.error(
        'Error in getAdminTasksCached:',
        getErrorMessage(error)
      );
      throw error;
    }
  }

  /**
   * Cache global task summary
   * NOTE: Admin summary is no longer cached - always fetch fresh data
   * This method is kept for backward compatibility but not used
   */
  async getGlobalSummaryCached() {
    const cacheKey = 'admin:summary:global';

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log('Cache HIT for global summary');
        return JSON.parse(cached);
      }

      this.logger.log('Cache MISS for global summary - fetching from DB');

      const statuses = [
        'unassigned',
        'assigned',
        'accepted',
        'completed',
        'rejected',
      ];
      const counts = await Promise.all(
        statuses.map((status) =>
          this.prisma.task.count({
            where: { status: status as unknown as TaskStatus },
          })
        )
      );

      const result = {
        unassigned: counts[0],
        assigned: counts[1],
        accepted: counts[2],
        completed: counts[3],
        rejected: counts[4],
        total: counts.reduce((a, b) => a + b, 0),
      };

      await this.redis.setex(cacheKey, 300, JSON.stringify(result));

      this.logger.log('Cached global summary');
      return result;
    } catch (error) {
      this.logger.error('Error in getGlobalSummaryCached:', error);
      throw error;
    }
  }

  async getWorkerTasksCached(
    workerId: string,
    status?: string,
    page = 1,
    limit = 20,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    const cacheKey = `worker:tasks:${workerId}:${status || 'all'}:${page}:${limit}:${sortBy}:${sortOrder}`;

    try {
      const cached = await this.executeWithCircuitBreaker(async () => {
        return await this.redis.get(cacheKey);
      });

      if (cached) {
        this.logger.log(
          `Cache HIT for worker ${workerId} tasks - sort: ${sortBy}:${sortOrder}`
        );
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(
        `Cache read failed for worker ${workerId}, falling back to database:`,
        getErrorMessage(error)
      );
    }

    this.logger.log(
      `Cache MISS for worker ${workerId} tasks - fetching from DB with sort: ${sortBy}:${sortOrder}`
    );

    try {
      const where: any = { assignedUserId: workerId };
      if (status) {
        const statusArray = status
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => {
            const normalized = String(s).toLowerCase();
            if (RealTaskStatus) {
              try {
                const enumVals = Object.values(RealTaskStatus)
                  .map(String)
                  .map((v) => v.toLowerCase());
                return enumVals.includes(normalized);
              } catch {
                return [
                  'unassigned',
                  'assigned',
                  'accepted',
                  'rejected',
                  'completed',
                ].includes(normalized);
              }
            }
            return [
              'unassigned',
              'assigned',
              'accepted',
              'rejected',
              'completed',
            ].includes(normalized);
          }) as string[];

        if (statusArray.length > 0) {
          where.status = { in: statusArray };
        }
      }

      const [tasks, total] = await Promise.all([
        this.prisma.task.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            title: true,
            address: true,
            lat: true,
            lon: true,
            status: true,
            geocodePending: true,
            errorLog: true,
            transactionNumber: true,
            requisitionDate: true,
            requisitionTime: true,
            customerName: true,
            phone: true,
            city: true,
            area: true,
            thana: true,
            orderStatus: true,
            lastStatusUpdate: true,
            productType: true,
            productName: true,
            unitPriceExVat: true,
            unitPriceIncVat: true,
            productCode: true,
            qty: true,
            mrp: true,
            invoiceAmount: true,
            paymentMode: true,
            deliveryPartner: true,
            assignedAt: true,
            createdAt: true,
            updatedAt: true,
            assignedUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                district: true,
                policeStation: true,
                area: true,
              },
            },
            territory: true,
          },
        }),
        this.prisma.task.count({ where }),
      ]);

      const result = {
        data: tasks,
        meta: {
          total,
          page,
          lastPage: Math.ceil(total / limit),
          limit,
          sortBy,
          sortOrder,
        },
      };

      try {
        await this.executeWithCircuitBreaker(async () => {
          return await this.redis.setex(
            cacheKey,
            this.TASK_LIST_TTL,
            JSON.stringify(result)
          );
        });
        this.logger.log(
          `Cached worker tasks for ${workerId} with sort: ${sortBy}:${sortOrder}`
        );
      } catch (cacheError) {
        this.logger.warn(
          `Failed to cache result for worker ${workerId}:`,
          cacheError
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Database query failed for worker ${workerId}:`, error);
      throw error;
    }
  }

  async getWorkerTaskSummaryCached(workerId: string) {
    const cacheKey = `worker:summary:${workerId}`;

    try {
      const cached = await this.executeWithCircuitBreaker(async () => {
        return await this.redis.get(cacheKey);
      });

      if (cached) {
        this.logger.log(`Cache HIT for worker ${workerId} summary`);
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(
        `Cache read failed for worker ${workerId} summary:`,
        error
      );
    }

    this.logger.log(
      `Cache MISS for worker ${workerId} summary - fetching from DB`
    );

    const statuses: any[] = RealTaskStatus
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
      assigned: counts[0],
      accepted: counts[1],
      completed: counts[2],
      rejected: counts[3],
      total: counts.reduce((a, b) => a + b, 0),
    };

    try {
      await this.executeWithCircuitBreaker(async () => {
        return await this.redis.setex(
          cacheKey,
          this.SUMMARY_TTL,
          JSON.stringify(summary)
        );
      });
      this.logger.log(`Cached worker ${workerId} summary with fresh data`);
    } catch (error) {
      this.logger.error(
        `Failed to cache summary for worker ${workerId}:`,
        error
      );
    }

    return summary;
  }

  // Cache all worker tasks (for background processes)

  async getAllWorkerTasksCached(workerId: string) {
    const cacheKey = `worker:tasks:all:${workerId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log(`Cache HIT for worker ${workerId} all tasks`);
      return JSON.parse(cached);
    }

    this.logger.log(
      `Cache MISS for worker ${workerId} all tasks - fetching from DB`
    );

    const tasks = await this.prisma.task.findMany({
      where: { assignedUserId: workerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        address: true,
        lat: true,
        lon: true,
        status: true,
        geocodePending: true,
        errorLog: true,
        transactionNumber: true,
        requisitionDate: true,
        requisitionTime: true,
        customerName: true,
        phone: true,
        city: true,
        area: true,
        thana: true,
        orderStatus: true,
        lastStatusUpdate: true,
        productType: true,
        productName: true,
        unitPriceExVat: true,
        unitPriceIncVat: true,
        productCode: true,
        qty: true,
        mrp: true,
        invoiceAmount: true,
        paymentMode: true,
        deliveryPartner: true,
        assignedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.redis.setex(cacheKey, this.ALL_TASKS_TTL, JSON.stringify(tasks));

    return tasks;
  }

  async invalidateWorkerCache(workerId: string) {
    const pattern = `worker:*:${workerId}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.log(
        `Invalidated ${keys.length} cache keys for worker ${workerId}`
      );
    }
  }

  //Invalidate specific worker task cache (including all sorting variations)

  async invalidateWorkerTaskCache(workerId: string, taskId?: string) {
    const patterns = [
      `worker:tasks:${workerId}:*`,
      `worker:summary:${workerId}`,
      `worker:tasks:all:${workerId}`,
    ];

    if (taskId) {
      patterns.push(`task:${taskId}:*`);
    }

    let totalKeysDeleted = 0;
    for (const pattern of patterns) {
      const keys = await this.getKeysByPattern(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        totalKeysDeleted += keys.length;
        this.logger.log(
          `Invalidated ${keys.length} cache keys for pattern: ${pattern}`
        );
      }
    }

    this.logger.log(
      `Total cache keys invalidated for worker ${workerId}: ${totalKeysDeleted} (including all sorting variations)`
    );
    return { deletedKeys: totalKeysDeleted };
  }

  //Get cache statistics

  async getCacheStats() {
    const info = await this.redis.info('memory');
    const keys = await this.redis.keys('worker:*');

    return {
      totalKeys: keys.length,
      memoryInfo: info,
      workerKeys: keys.filter((key) => key.startsWith('worker:')).length,
    };
  }

  async clearAllWorkerCaches() {
    const keys = await this.redis.keys('worker:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.log(`Cleared ${keys.length} worker cache keys`);
    }
    return { cleared: keys.length };
  }

  //Clear all admin caches (admin function)
  //NOTE: Admin tasks are no longer cached, but this method is kept for cleanup

  async clearAllAdminCaches() {
    const keys = await this.redis.keys('admin:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.log(
        `Cleared ${keys.length} admin cache keys (admin no longer uses caching)`
      );
    }
    return { cleared: keys.length };
  }

  async clearAllCaches() {
    try {
      const workerKeys = await this.redis.keys('worker:*');
      const adminKeys = await this.redis.keys('admin:*');
      const allKeys = [...workerKeys, ...adminKeys];

      if (allKeys.length > 0) {
        await this.redis.del(...allKeys);
        this.logger.log(
          `Cleared ${allKeys.length} total cache keys (${workerKeys.length} worker + ${adminKeys.length} admin)`
        );
      }
      return {
        cleared: allKeys.length,
        workerKeys: workerKeys.length,
        adminKeys: adminKeys.length,
      };
    } catch (error) {
      this.logger.error('Error clearing all caches:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const startTime = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - startTime;

      const info = await this.redis.info('memory');
      const memoryInfo = this.parseMemoryInfo(info);

      return {
        status: 'healthy',
        details: {
          responseTime: `${responseTime}ms`,
          memoryUsage: memoryInfo.used_memory_human,
          maxMemory: memoryInfo.maxmemory_human,
          circuitBreakerState: this.circuitBreaker.state,
          circuitBreakerFailures: this.circuitBreaker.failures,
        },
      };
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        details: {
          error: getErrorMessage(error),
          circuitBreakerState: this.circuitBreaker.state,
        },
      };
    }
  }

  async resetCircuitBreaker(): Promise<{ success: boolean; message: string }> {
    try {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failures = 0;
      this.circuitBreaker.lastFailure = 0;

      this.logger.log('Circuit breaker manually reset');
      return {
        success: true,
        message: 'Circuit breaker reset successfully',
      };
    } catch (error: unknown) {
      this.logger.error(
        'Error resetting circuit breaker:',
        getErrorMessage(error)
      );
      return {
        success: false,
        message: `Failed to reset circuit breaker: ${getErrorMessage(error)}`,
      };
    }
  }

  private async getKeysByPattern(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  private async withLock<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `lock:${key}`;
    const lockValue = Date.now().toString();
    const lockTTL = 5000;

    const acquired = await this.redis.set(
      lockKey,
      lockValue,
      'PX',
      lockTTL,
      'NX'
    );
    if (!acquired) {
      throw new Error(`Lock acquisition failed for key: ${key}`);
    }

    try {
      return await operation();
    } finally {
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  private circuitBreaker = {
    failures: 0,
    lastFailure: 0,
    state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    failureThreshold: 5,
    recoveryTimeout: 60000,
  };

  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();

    if (
      this.circuitBreaker.state === 'CLOSED' &&
      this.circuitBreaker.failures >= this.circuitBreaker.failureThreshold
    ) {
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.lastFailure = now;
      this.logger.warn('Circuit breaker opened due to failures');
    }

    if (
      this.circuitBreaker.state === 'OPEN' &&
      now - this.circuitBreaker.lastFailure >
        this.circuitBreaker.recoveryTimeout
    ) {
      this.circuitBreaker.state = 'HALF_OPEN';
      this.logger.warn('Circuit breaker moved to half-open state');
    }

    if (this.circuitBreaker.state === 'OPEN') {
      throw new Error(
        'Circuit breaker is OPEN - Redis operations temporarily disabled'
      );
    }

    try {
      const result = await operation();
      this.onCircuitBreakerSuccess();
      return result;
    } catch (error) {
      this.onCircuitBreakerFailure();
      throw error;
    }
  }

  private onCircuitBreakerSuccess() {
    this.circuitBreaker.failures = 0;
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'CLOSED';
      this.logger.log('Circuit breaker closed - Redis operations restored');
    }
  }

  private onCircuitBreakerFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    this.logger.warn(
      `Circuit breaker failure count: ${this.circuitBreaker.failures}`
    );
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 100
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.executeWithCircuitBreaker(operation);
      } catch (error) {
        if (i === maxRetries - 1) {
          this.logger.error(
            `Operation failed after ${maxRetries} retries:`,
            error
          );
          throw error;
        }

        const delay = baseDelay * Math.pow(2, i);
        this.logger.warn(
          `Operation failed, retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error('Retry operation failed');
  }

  async updateTaskInWorkerCache(
    workerId: string,
    taskId: string,
    updatedTaskData: any
  ) {
    const patterns = [
      `worker:tasks:${workerId}:*`,
      `worker:tasks:all:${workerId}`,
    ];

    let updatedKeys = 0;

    for (const pattern of patterns) {
      const keys = await this.getKeysByPattern(pattern);

      for (const key of keys) {
        await this.retryOperation(async () => {
          return await this.withLock(key, async () => {
            const cached = await this.redis.get(key);
            if (cached) {
              const data = JSON.parse(cached);

              if (data.data && Array.isArray(data.data)) {
                const updatedData = data.data.map((task: any) =>
                  task.id === taskId ? { ...task, ...updatedTaskData } : task
                );

                await this.redis.setex(
                  key,
                  this.TASK_LIST_TTL,
                  JSON.stringify({
                    ...data,
                    data: updatedData,
                  })
                );
                updatedKeys++;
              } else if (Array.isArray(data)) {
                const updatedData = data.map((task: any) =>
                  task.id === taskId ? { ...task, ...updatedTaskData } : task
                );

                await this.redis.setex(
                  key,
                  this.ALL_TASKS_TTL,
                  JSON.stringify(updatedData)
                );
                updatedKeys++;
              }
            }
          });
        });
      }
    }

    this.logger.log(
      `Updated task ${taskId} in ${updatedKeys} cache keys for worker ${workerId} (all sorting variations)`
    );
    return { updatedKeys };
  }

  async addTaskToWorkerCache(workerId: string, _newTask: any) {
    try {
      const invalidationResult = await this.invalidateWorkerTaskCache(workerId);

      this.logger.log(
        `Cache invalidated for worker ${workerId} after new task assignment. Keys deleted: ${invalidationResult.deletedKeys}`
      );

      await this.updateWorkerTaskSummaryCache(workerId, {
        newStatus: 'assigned',
      });

      return {
        updatedKeys: 0,
        invalidatedKeys: invalidationResult.deletedKeys,
        strategy: 'invalidation',
      };
    } catch (error) {
      this.logger.error(
        `Error adding task to worker cache for ${workerId}:`,
        error
      );

      try {
        await this.invalidateWorkerTaskCache(workerId);
      } catch (fallbackError) {
        this.logger.error(
          `Fallback invalidation also failed for ${workerId}:`,
          fallbackError
        );
      }
      return {
        updatedKeys: 0,
        error: getErrorMessage(error),
      };
    }
  }

  async removeTaskFromWorkerCache(workerId: string, taskId: string) {
    const patterns = [
      `worker:tasks:${workerId}:*`,
      `worker:tasks:all:${workerId}`,
    ];

    let updatedKeys = 0;

    for (const pattern of patterns) {
      const keys = await this.getKeysByPattern(pattern);

      for (const key of keys) {
        const cached = await this.redis.get(key);
        if (cached) {
          try {
            const data = JSON.parse(cached);

            if (data.data && Array.isArray(data.data)) {
              const updatedData = data.data.filter(
                (task: any) => task.id !== taskId
              );

              await this.redis.setex(
                key,
                this.TASK_LIST_TTL,
                JSON.stringify({
                  ...data,
                  data: updatedData,
                  meta: {
                    ...data.meta,
                    total: Math.max(0, data.meta.total - 1),
                  },
                })
              );
              updatedKeys++;
            } else if (Array.isArray(data)) {
              const updatedData = data.filter(
                (task: any) => task.id !== taskId
              );

              await this.redis.setex(
                key,
                this.ALL_TASKS_TTL,
                JSON.stringify(updatedData)
              );
              updatedKeys++;
            }
          } catch (error) {
            this.logger.error(
              `Error removing task from cache key ${key}:`,
              error
            );
          }
        }
      }
    }

    this.logger.log(
      `Removed task ${taskId} from ${updatedKeys} cache keys for worker ${workerId} (all sorting variations)`
    );
    return { updatedKeys };
  }

  async updateWorkerTaskSummaryCacheBulk(
    workerId: string,
    taskCounts: {
      assigned?: number;
      accepted?: number;
      completed?: number;
      rejected?: number;
    }
  ) {
    const cacheKey = `worker:summary:${workerId}`;

    try {
      const cached = await this.executeWithCircuitBreaker(async () => {
        return await this.redis.get(cacheKey);
      });

      if (cached) {
        try {
          const summary = JSON.parse(cached);

          if (taskCounts.assigned) {
            summary.assigned = (summary.assigned || 0) + taskCounts.assigned;
          }
          if (taskCounts.accepted) {
            summary.accepted = (summary.accepted || 0) + taskCounts.accepted;
          }
          if (taskCounts.completed) {
            summary.completed = (summary.completed || 0) + taskCounts.completed;
          }
          if (taskCounts.rejected) {
            summary.rejected = (summary.rejected || 0) + taskCounts.rejected;
          }

          summary.total = Object.values(summary).reduce(
            (sum: number, count: any) =>
              typeof count === 'number' ? sum + count : sum,
            0
          );

          await this.executeWithCircuitBreaker(async () => {
            return await this.redis.setex(
              cacheKey,
              this.SUMMARY_TTL,
              JSON.stringify(summary)
            );
          });

          this.logger.log(
            ` Updated summary cache for worker ${workerId} with bulk counts:`,
            taskCounts
          );
          this.logger.log(`📊 New summary:`, summary);

          return { updated: true };
        } catch (error) {
          this.logger.error(
            `Error updating summary cache for worker ${workerId}:`,
            error
          );

          await this.executeWithCircuitBreaker(async () => {
            return await this.redis.del(cacheKey);
          });
        }
      } else {
        this.logger.log(
          `🔄 Summary cache not found for worker ${workerId}, fetching fresh data`
        );
        try {
          const _freshSummary = await this.getWorkerTaskSummaryCached(workerId);
          return {
            updated: true,
            freshData: true,
            freshSummary: _freshSummary,
          };
        } catch (error) {
          this.logger.error(
            `Error fetching fresh summary for worker ${workerId}:`,
            error
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Cache operation failed for worker ${workerId}:`,
        error
      );

      try {
        await this.executeWithCircuitBreaker(async () => {
          return await this.redis.del(cacheKey);
        });
      } catch (delError) {
        this.logger.error(
          `Failed to invalidate cache for worker ${workerId}:`,
          delError
        );
      }
    }

    return { updated: false };
  }

  async updateWorkerTaskSummaryCache(
    workerId: string,
    statusChange: {
      oldStatus?: string;
      newStatus: string;
    }
  ) {
    const cacheKey = `worker:summary:${workerId}`;

    try {
      const cached = await this.executeWithCircuitBreaker(async () => {
        return await this.redis.get(cacheKey);
      });

      if (cached) {
        try {
          const summary = JSON.parse(cached);

          if (
            statusChange.oldStatus &&
            summary[statusChange.oldStatus] !== undefined
          ) {
            summary[statusChange.oldStatus] = Math.max(
              0,
              summary[statusChange.oldStatus] - 1
            );
          }

          if (summary[statusChange.newStatus] !== undefined) {
            summary[statusChange.newStatus]++;
          }

          summary.total = Object.values(summary).reduce(
            (sum: number, count: any) =>
              typeof count === 'number' ? sum + count : sum,
            0
          );

          await this.executeWithCircuitBreaker(async () => {
            return await this.redis.setex(
              cacheKey,
              this.SUMMARY_TTL,
              JSON.stringify(summary)
            );
          });

          this.logger.log(
            ` Updated summary cache for worker ${workerId}: ${statusChange.oldStatus} → ${statusChange.newStatus}`
          );
          this.logger.log(`📊 New counts:`, summary);

          return { updated: true };
        } catch (error) {
          this.logger.error(
            `Error updating summary cache for worker ${workerId}:`,
            error
          );

          await this.executeWithCircuitBreaker(async () => {
            return await this.redis.del(cacheKey);
          });
        }
      } else {
        this.logger.log(
          `🔄 Summary cache not found for worker ${workerId}, fetching fresh data`
        );
        try {
          const freshSummary = await this.getWorkerTaskSummaryCached(workerId);
          return { updated: true, freshData: true, freshSummary };
        } catch (error) {
          this.logger.error(
            `Error fetching fresh summary for worker ${workerId}:`,
            error
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Cache operation failed for worker ${workerId}:`,
        error
      );

      try {
        await this.executeWithCircuitBreaker(async () => {
          return await this.redis.del(cacheKey);
        });
      } catch (delError) {
        this.logger.error(
          `Failed to invalidate cache for worker ${workerId}:`,
          delError
        );
      }
    }

    return { updated: false };
  }

  async updateWorkerDetailsInAllTasks(
    workerId: string,
    updatedWorkerData: any
  ) {
    const patterns = [
      `worker:tasks:${workerId}:*`,
      `worker:tasks:all:${workerId}`,
    ];

    let updatedKeys = 0;

    for (const pattern of patterns) {
      const keys = await this.getKeysByPattern(pattern);

      for (const key of keys) {
        const cached = await this.redis.get(key);
        if (cached) {
          try {
            const data = JSON.parse(cached);

            if (data.data && Array.isArray(data.data)) {
              const updatedData = data.data.map((task: any) => {
                if (task.assignedUser && task.assignedUser.id === workerId) {
                  return {
                    ...task,
                    assignedUser: {
                      ...task.assignedUser,
                      ...updatedWorkerData,
                    },
                  };
                }
                return task;
              });

              await this.redis.setex(
                key,
                this.TASK_LIST_TTL,
                JSON.stringify({
                  ...data,
                  data: updatedData,
                })
              );
              updatedKeys++;
            } else if (Array.isArray(data)) {
              const updatedData = data.map((task: any) => {
                if (task.assignedUser && task.assignedUser.id === workerId) {
                  return {
                    ...task,
                    assignedUser: {
                      ...task.assignedUser,
                      ...updatedWorkerData,
                    },
                  };
                }
                return task;
              });

              await this.redis.setex(
                key,
                this.ALL_TASKS_TTL,
                JSON.stringify(updatedData)
              );
              updatedKeys++;
            }
          } catch (error) {
            this.logger.error(
              `Error updating worker details in cache key ${key}:`,
              error
            );
          }
        }
      }
    }

    this.logger.log(
      `Updated worker details for ${workerId} in ${updatedKeys} cache keys`
    );
  }

  async smartCacheUpdate(
    workerId: string,
    taskId: string,
    updateType:
      | 'status_change'
      | 'task_assignment'
      | 'task_completion'
      | 'task_rejection'
      | 'worker_profile_update',
    taskData?: any
  ) {
    switch (updateType) {
      case 'status_change':
        await this.updateTaskInWorkerCache(workerId, taskId, taskData);
        await this.updateWorkerTaskSummaryCache(workerId, {
          oldStatus: taskData?.oldStatus,
          newStatus: taskData?.status,
        });
        break;

      case 'task_assignment':
        if (taskData) {
          await this.addTaskToWorkerCache(workerId, taskData);
          await this.updateWorkerTaskSummaryCache(workerId, {
            newStatus: 'assigned',
          });
        }
        break;

      case 'task_completion':
        await this.removeTaskFromWorkerCache(workerId, taskId);
        await this.updateWorkerTaskSummaryCache(workerId, {
          oldStatus: 'accepted',
          newStatus: 'completed',
        });
        break;

      case 'task_rejection':
        await this.updateTaskInWorkerCache(workerId, taskId, taskData);
        await this.updateWorkerTaskSummaryCache(workerId, {
          oldStatus: 'assigned',
          newStatus: 'rejected',
        });
        break;

      case 'worker_profile_update':
        await this.updateWorkerDetailsInAllTasks(workerId, taskData);
        break;

      default:
        await this.invalidateWorkerTaskCache(workerId, taskId);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, value);
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Redis GET failed for key ${key}: ${error}`);
      return null;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete keys by pattern (helper for admin caches)
   */
  async delByPattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(pattern);
    if (!keys.length) return 0;
    return await this.redis.del(keys);
  }

  async delMultiple(keys: string[]): Promise<number> {
    try {
      if (keys.length === 0) return 0;
      return await this.redis.del(...keys);
    } catch (error) {
      this.logger.error(`Error deleting keys:`, error);
      throw error;
    }
  }

  async updateTaskInWorkerCacheNew(
    workerId: string,
    taskId: string,
    taskData: any
  ): Promise<void> {
    try {
      const workerKey = `worker:${workerId}`;
      const cached = await this.redis.get(workerKey);

      if (cached) {
        const worker: any = JSON.parse(cached);
        if (worker.tasks) {
          const taskIndex = worker.tasks.findIndex((t: any) => t.id === taskId);
          if (taskIndex !== -1) {
            worker.tasks[taskIndex] = {
              ...worker.tasks[taskIndex],
              ...taskData,
            };
            await this.redis.setex(workerKey, 300, JSON.stringify(worker));
            this.logger.debug(
              `Updated task ${taskId} in worker ${workerId} cache`
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error updating task in worker cache:`, error);
    }
  }

  async updateWorkerTaskSummaryCacheWithStatus(
    workerId: string,
    statusChange: {
      oldStatus: string;
      newStatus: string;
      taskId: string;
    }
  ): Promise<void> {
    try {
      const summaryKey = `worker:${workerId}:summary`;
      const cached = await this.redis.get(summaryKey);

      if (cached) {
        const summary: any = JSON.parse(cached);

        if (summary.counts) {
          if (summary.counts[statusChange.oldStatus]) {
            summary.counts[statusChange.oldStatus] = Math.max(
              0,
              summary.counts[statusChange.oldStatus] - 1
            );
          }

          if (summary.counts[statusChange.newStatus]) {
            summary.counts[statusChange.newStatus] =
              (summary.counts[statusChange.newStatus] || 0) + 1;
          }
        }

        summary.lastActivity = new Date().toISOString();
        summary.lastStatusChange = statusChange;

        await this.redis.setex(summaryKey, 300, JSON.stringify(summary));
        this.logger.debug(
          `Updated worker ${workerId} summary cache with status change`
        );
      }
    } catch (error) {
      this.logger.error(
        `Error updating worker summary cache with status:`,
        error
      );
    }
  }

  async invalidateSpatialIndexCache(): Promise<void> {
    try {
      const keys = await this.redis.keys('workers:spatial*');
      const spatialKeys = await this.redis.keys('spatial:index*');
      const allKeys = [...keys, ...spatialKeys];

      if (allKeys.length > 0) {
        await this.redis.del(...allKeys);
        this.logger.log(
          `Invalidated ${allKeys.length} spatial index cache keys`
        );
      }
    } catch (error) {
      this.logger.error(`Error invalidating spatial index cache:`, error);
    }
  }

  async updateUnassignedTasksCache(newTasks: any[]): Promise<void> {
    try {
      const cacheKey = 'tasks:unassigned';
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const existingTasks: any[] = JSON.parse(cached);
        const updatedTasks = [...existingTasks, ...newTasks];
        await this.redis.setex(
          cacheKey,
          this.TASK_LIST_TTL,
          JSON.stringify(updatedTasks)
        );
        this.logger.debug(
          `Updated unassigned tasks cache with ${newTasks.length} new tasks`
        );
      } else {
        await this.redis.setex(
          cacheKey,
          this.TASK_LIST_TTL,
          JSON.stringify(newTasks)
        );
        this.logger.debug(
          `Created unassigned tasks cache with ${newTasks.length} tasks`
        );
      }
    } catch (error) {
      this.logger.error(`Error updating unassigned tasks cache:`, error);
    }
  }

  async getCacheVersion(key: string): Promise<number> {
    try {
      const versionKey = `${key}:version`;
      const version = await this.redis.get(versionKey);
      return version ? parseInt(version) : 0;
    } catch (error) {
      this.logger.error(`Error getting cache version for ${key}:`, error);
      return 0;
    }
  }

  async setCacheVersion(key: string, version: number): Promise<void> {
    try {
      const versionKey = `${key}:version`;
      await this.redis.setex(versionKey, 300, version.toString());
    } catch (error) {
      this.logger.error(`Error setting cache version for ${key}:`, error);
    }
  }

  async updateCacheWithVersion(
    key: string,
    data: any,
    version: number
  ): Promise<boolean> {
    try {
      const currentVersion = await this.getCacheVersion(key);

      if (currentVersion && currentVersion >= version) {
        this.logger.warn(
          `Cache version conflict for ${key}: current=${currentVersion}, requested=${version}`
        );
        return false;
      }

      await this.redis.setex(key, 300, JSON.stringify(data));
      await this.setCacheVersion(key, version);
      this.logger.debug(`Updated cache ${key} with version ${version}`);
      return true;
    } catch (error) {
      this.logger.error(`Error updating cache with version for ${key}:`, error);
      return false;
    }
  }
}
