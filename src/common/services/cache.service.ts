import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getErrorMessage } from '../utils/error.util';
// import type { AuthUser } from '../types/auth-user';
import { Role } from '../enums/role.enum';
import type { Role as PrismaRole, User } from '@prisma/client';
import Redis from 'ioredis';

type CachedWorker = {
  id: string;
  fullName?: string;
  email?: string | null;
  area?: string | null;
  district?: string | null;
  policeStation?: string | null;
  lat?: number | null;
  lon?: number | null;
  active?: boolean;
  role?: Role;
  territory?: string | null;
  publicId?: number;
  _count: {
    tasks: number;
  };
};

type PublicUser = {
  id: string;
  publicId: number;
  email: string;
  fullName: string;
  role: PrismaRole;
  territory?: string | null;
  district?: string | null;
  policeStation?: string | null;
  area?: string | null;
  lat?: number | null;
  lon?: number | null;
  active?: boolean;
  phone?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private workersCache: CachedWorker[] | null = null;
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private redis: InstanceType<typeof Redis> | null = null;

  constructor(private prisma: PrismaService) {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl)
        throw new Error('REDIS_URL environment variable is not set');

      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redis.on('error', (err: unknown) => {
        this.logger.error(
          'Redis connection error in CacheService:',
          getErrorMessage(err)
        );
      });

      this.redis.on('connect', () => {
        this.logger.log('CacheService Redis connected successfully');
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis in CacheService:', error);
    }
  }

  async getWorkers(): Promise<User[]> {
    this.logger.log(
      'Fetching fresh workers data from database (caching disabled)'
    );
    const workers = await this.prisma.user.findMany({
      where: {
        role: 'WORKER',
        lat: { not: null },
        lon: { not: null },
        active: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        area: true,
        district: true,
        policeStation: true,
        lat: true,
        lon: true,
        active: true,
        role: true,
        territory: true,
        publicId: true,

        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            tasks: {
              where: {
                status: {
                  in: ['assigned', 'accepted'],
                },
              },
            },
          },
        },
      },
    });

    return workers as unknown as User[];
  }

  invalidateWorkersCache(): void {
    this.logger.log('Workers cache invalidation called (caching disabled)');
  }

  updateWorkerInCache(
    userId: string,
    _updatedData: Partial<CachedWorker>
  ): void {
    this.logger.log(`Worker ${userId} cache update called (caching disabled)`);
  }

  addWorkerToCache(_newWorker: User): void {
    // newWorker not used while caching is disabled
    this.logger.log(`Worker cache add called (caching disabled)`);
  }

  removeWorkerFromCache(userId: string): void {
    this.logger.log(`Worker ${userId} cache removal called (caching disabled)`);
  }

  async getWorkersWithTaskCount() {
    const workers = await this.getWorkers();

    return workers.map((worker) => ({
      id: worker.id,
      fullName: worker.fullName,
      email: worker.email,
      area: worker.area,
      district: worker.district,
      policeStation: worker.policeStation,
      location:
        worker.lat && worker.lon
          ? {
              lat: worker.lat,
              lon: worker.lon,
            }
          : null,
      currentTaskCount: (worker as any)._count?.tasks ?? 0,
    }));
  }

  async getAllUsersCached(): Promise<PublicUser[]> {
    this.logger.log('Fetching all users from database (caching disabled)');
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        publicId: true,
        email: true,
        fullName: true,
        role: true,
        territory: true,
        district: true,
        policeStation: true,
        area: true,
        lat: true,
        lon: true,
        active: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async invalidateAllUsersCache(): Promise<void> {
    this.logger.log('All users cache invalidation called (caching disabled)');
  }

  async updateAllUsersCache(_users: PublicUser[]): Promise<void> {
    this.logger.log('All users cache update called (caching disabled)');
  }
}
