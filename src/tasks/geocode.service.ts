import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { getErrorMessage } from '../common/utils/error.util';
type Task = any;
import { RedisCacheService } from '../common/services/redis-cache.service';

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);

  constructor(
    private prisma: PrismaService,
    private redisCache: RedisCacheService
  ) {}

  async fetchGeocode(task: Task): Promise<'success' | 'fail'> {
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) throw new Error('Google Maps API key is missing');

      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            address: task.address,
            key: apiKey,
            region: 'bd',
          },
        }
      );

      const result = response.data.results?.[0];

      if (result) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            lat: result.geometry.location.lat,
            lon: result.geometry.location.lng,
            geocodePending: false,
            errorLog: null,
          },
        });
        return 'success';
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            errorLog: 'No geocoding results found',
          },
        });
        return 'fail';
      }
    } catch (err: unknown) {
      const errorStr = getErrorMessage(err);
      this.logger.error(`Geocode failed for task ${task.id}: ${errorStr}`);

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          errorLog: errorStr,
        },
      });

      return 'fail';
    }
  }

  async batchGeocode(batchSize = 100): Promise<{
    successCount: number;
    failCount: number;
    total: number;
    cacheUpdated?: boolean;
  }> {
    const tasks = await this.prisma.task.findMany({
      where: { geocodePending: true },
      orderBy: { createdAt: 'asc' },
    });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map((task) => this.fetchGeocode(task))
      );

      results.forEach((res) => {
        if (res === 'success') successCount++;
        else failCount++;
      });
    }

    try {
      if (successCount > 0) {
        await this.redisCache.del('tasks:unassigned');

        await this.redisCache.del('admin:tasks:*');

        this.logger.log(
          `Geocoding completed - ${successCount} tasks geocoded successfully`
        );
        this.logger.log(`Cache invalidated for geocoded tasks`);
        this.logger.log(`Unassigned tasks cache invalidated for fresh data`);
      }
    } catch (error: unknown) {
      this.logger.error(
        `Cache update failed for geocoding completion:`,
        getErrorMessage(error)
      );
    }

    return {
      successCount,
      failCount,
      total: tasks.length,
      cacheUpdated: true,
    };
  }

  async getGeocodingStats(): Promise<{
    pending: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const [pending, completed, failed] = await Promise.all([
      this.prisma.task.count({
        where: { geocodePending: true },
      }),
      this.prisma.task.count({
        where: {
          geocodePending: false,
          lat: { not: null },
          lon: { not: null },
        },
      }),
      this.prisma.task.count({
        where: {
          geocodePending: false,
          lat: null,
          lon: null,
          errorLog: { not: null },
        },
      }),
    ]);

    return {
      pending,
      completed,
      failed,
      total: pending + completed + failed,
    };
  }

  async resetFailedGeocoding(): Promise<{ resetCount: number }> {
    const result = await this.prisma.task.updateMany({
      where: {
        geocodePending: false,
        lat: null,
        lon: null,
        errorLog: { not: null },
      },
      data: {
        geocodePending: true,
        errorLog: null,
      },
    });

    return { resetCount: result.count };
  }
}
