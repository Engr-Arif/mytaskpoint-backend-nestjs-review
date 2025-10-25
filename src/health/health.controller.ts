import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from '../common/utils/error.util';
import { RedisCacheService } from '../common/services/redis-cache.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisCache: RedisCacheService
  ) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.safeQueryRaw`SELECT 1`;

      const redisHealth = await this.redisCache.healthCheck();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        database: 'connected',
        redis: redisHealth.status,
        redisDetails: redisHealth.details,
      };
    } catch (error: unknown) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        database: 'disconnected',
        redis: 'unknown',
        error: getErrorMessage(error),
      };
    }
  }

  @Public()
  @Get('ready')
  async readiness() {
    try {
      await this.prisma.safeQueryRaw`SELECT 1`;

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
        services: {
          database: 'ready',
          api: 'ready',
        },
      };
    } catch (error: unknown) {
      return {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        services: {
          database: 'not ready',
          api: 'ready',
        },
        error: getErrorMessage(error),
      };
    }
  }
}
