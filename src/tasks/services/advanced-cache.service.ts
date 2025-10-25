import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import type { Task } from '@prisma/client';
import { getErrorMessage } from '../../common/utils/error.util';

interface CachedWorker {
  id: string;
  lat: number;
  lon: number;
  role: string;
  active: boolean;
  currentTaskCount: number;
  lastUpdated: number;
}

interface CachedTask {
  id: string;
  lat: number;
  lon: number;
  status: string;
  priority?: string;
  lastUpdated: number;
}

@Injectable()
export class AdvancedCacheService {
  private readonly logger = new Logger(AdvancedCacheService.name);
  private readonly WORKER_CACHE_TTL = 300;
  private readonly TASK_CACHE_TTL = 180;
  private readonly SPATIAL_INDEX_TTL = 600;

  constructor(private redisCache: RedisCacheService) {}

  // Cache workers with spatial indexing

  async cacheWorkersWithSpatialIndex(workers: any[]): Promise<void> {
    try {
      const cacheKey = 'workers:spatial_index';
      const cachedWorkers: CachedWorker[] = workers.map((worker) => ({
        id: worker.id,
        lat: worker.lat || 0,
        lon: worker.lon || 0,
        role: worker.role,
        active: worker.active,
        currentTaskCount: 0,
        lastUpdated: Date.now(),
      }));

      await this.redisCache.set(
        cacheKey,
        JSON.stringify(cachedWorkers),
        this.SPATIAL_INDEX_TTL
      );

      await Promise.all(
        workers.map((worker) =>
          this.redisCache.set(
            `worker:${worker.id}`,
            JSON.stringify(cachedWorkers.find((w) => w.id === worker.id)),
            this.WORKER_CACHE_TTL
          )
        )
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to cache workers with spatial index:',
        getErrorMessage(error)
      );
    }
  }

  async getCachedWorkers(): Promise<CachedWorker[]> {
    try {
      const cacheKey = 'workers:spatial_index';
      const cached = await this.redisCache.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      return [];
    } catch (error: unknown) {
      this.logger.error(
        'Failed to get cached workers:',
        getErrorMessage(error)
      );
      return [];
    }
  }

  // Update worker task count in cache

  async updateWorkerTaskCount(
    workerId: string,
    taskCount: number
  ): Promise<void> {
    try {
      const workerKey = `worker:${workerId}`;
      const cached = await this.redisCache.get(workerKey);

      if (cached) {
        const worker: CachedWorker = JSON.parse(cached);
        worker.currentTaskCount = taskCount;
        worker.lastUpdated = Date.now();

        await this.redisCache.set(
          workerKey,
          JSON.stringify(worker),
          this.WORKER_CACHE_TTL
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to update worker task count for ${workerId}:`,
        getErrorMessage(error)
      );
    }
  }

  // Cache unassigned tasks

  async cacheUnassignedTasks(tasks: Task[]): Promise<void> {
    try {
      const cacheKey = 'tasks:unassigned';
      const cachedTasks: CachedTask[] = tasks.map((task) => ({
        id: task.id,
        lat: task.lat || 0,
        lon: task.lon || 0,
        status: task.status,
        priority: 'NORMAL',
        lastUpdated: Date.now(),
      }));

      await this.redisCache.set(
        cacheKey,
        JSON.stringify(cachedTasks),
        this.TASK_CACHE_TTL
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to cache unassigned tasks:',
        getErrorMessage(error)
      );
    }
  }

  //Get cached unassigned tasks

  async getCachedUnassignedTasks(): Promise<CachedTask[]> {
    try {
      const cacheKey = 'tasks:unassigned';
      const cached = await this.redisCache.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      return [];
    } catch (error: unknown) {
      this.logger.error(
        'Failed to get cached unassigned tasks:',
        getErrorMessage(error)
      );
      return [];
    }
  }

  //Cache allocation results for analytics

  async cacheAllocationResults(results: {
    totalTasks: number;
    allocated: number;
    failed: number;
    successRate: number;
    duration: number;
    timestamp: number;
  }): Promise<void> {
    try {
      const cacheKey = `allocation:results:${Date.now()}`;
      await this.redisCache.set(cacheKey, JSON.stringify(results), 3600);

      const recentKey = 'allocation:recent';
      const recent = await this.redisCache.get(recentKey);
      const recentList = recent ? JSON.parse(recent) : [];

      recentList.push(results);

      if (recentList.length > 50) {
        recentList.splice(0, recentList.length - 50);
      }

      await this.redisCache.set(recentKey, JSON.stringify(recentList), 3600);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to cache allocation results:',
        getErrorMessage(error)
      );
    }
  }

  // Get recent allocation results

  async getRecentAllocationResults(limit = 20): Promise<any[]> {
    try {
      const recentKey = 'allocation:recent';
      const recent = await this.redisCache.get(recentKey);

      if (recent) {
        const recentList = JSON.parse(recent);
        return recentList.slice(-limit);
      }

      return [];
    } catch (error: unknown) {
      this.logger.error(
        'Failed to get recent allocation results:',
        getErrorMessage(error)
      );
      return [];
    }
  }

  //  Cache spatial index statistics

  async cacheSpatialIndexStats(stats: {
    totalWorkers: number;
    gridCells: number;
    avgWorkersPerCell: number;
    timestamp: number;
  }): Promise<void> {
    try {
      const cacheKey = 'spatial:index:stats';
      await this.redisCache.set(
        cacheKey,
        JSON.stringify(stats),
        this.SPATIAL_INDEX_TTL
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to cache spatial index stats:',
        getErrorMessage(error)
      );
    }
  }

  // Get cached spatial index statistics
  //  Get cached spatial index statistics

  async getCachedSpatialIndexStats(): Promise<any> {
    try {
      const cacheKey = 'spatial:index:stats';
      const cached = await this.redisCache.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error: unknown) {
      this.logger.error(
        'Failed to get cached spatial index stats:',
        getErrorMessage(error)
      );
      return null;
    }
  }

  //  Invalidate all task allocation caches

  async invalidateAllocationCaches(): Promise<void> {
    try {
      const keys = [
        'workers:spatial_index',
        'tasks:unassigned',
        'spatial:index:stats',
      ];

      await Promise.all(keys.map((key) => this.redisCache.del(key)));
    } catch (error: unknown) {
      this.logger.error(
        'Failed to invalidate allocation caches:',
        getErrorMessage(error)
      );
    }
  }

  //  Get cache statistics

  async getCacheStats(): Promise<{
    workerCacheSize: number;
    taskCacheSize: number;
    recentAllocations: number;
    cacheHitRate?: number;
  }> {
    try {
      const [workers, tasks, recent] = await Promise.all([
        this.getCachedWorkers(),
        this.getCachedUnassignedTasks(),
        this.getRecentAllocationResults(),
      ]);

      return {
        workerCacheSize: workers.length,
        taskCacheSize: tasks.length,
        recentAllocations: recent.length,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get cache stats:', getErrorMessage(error));
      return {
        workerCacheSize: 0,
        taskCacheSize: 0,
        recentAllocations: 0,
      };
    }
  }

  //  Real-time cache synchronization with version control

  async syncCacheWithVersion(
    key: string,
    data: any,
    version: number
  ): Promise<boolean> {
    try {
      const currentVersion = await this.redisCache.getCacheVersion(key);

      if (currentVersion && currentVersion >= version) {
        this.logger.warn(
          `Cache version conflict for ${key}: current=${currentVersion}, requested=${version}`
        );
        return false;
      }

      await this.redisCache.updateCacheWithVersion(key, data, version);
      this.logger.log(`Cache synchronized for ${key} with version ${version}`);
      return true;
    } catch (error: unknown) {
      this.logger.error(
        `Cache synchronization failed for ${key}:`,
        getErrorMessage(error)
      );
      return false;
    }
  }

  //  Batch cache synchronization for multiple keys

  async batchSyncCache(
    updates: Array<{ key: string; data: any; version: number }>
  ): Promise<{
    successful: number;
    failed: number;
    conflicts: number;
  }> {
    let successful = 0;
    let failed = 0;
    let conflicts = 0;

    for (const update of updates) {
      try {
        const result = await this.syncCacheWithVersion(
          update.key,
          update.data,
          update.version
        );
        if (result) {
          successful++;
        } else {
          conflicts++;
        }
      } catch (error: unknown) {
        failed++;
        this.logger.error(
          `Batch sync failed for ${update.key}:`,
          getErrorMessage(error)
        );
      }
    }

    this.logger.log(
      `Batch cache sync completed: ${successful} successful, ${conflicts} conflicts, ${failed} failed`
    );
    return { successful, failed, conflicts };
  }

  //  Get cache version for conflict resolution

  async getCacheVersion(key: string): Promise<number> {
    return this.redisCache.getCacheVersion(key);
  }

  //  Set cache version for conflict resolution

  async setCacheVersion(key: string, version: number): Promise<void> {
    return this.redisCache.setCacheVersion(key, version);
  }
}
