import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async cleanupDatabase() {

    await this.prisma.locationVisit.deleteMany();
    await this.prisma.locationChangeRequest.deleteMany();
    await this.prisma.passwordReset.deleteMany();
    await this.prisma.taskOtp.deleteMany();
    await this.prisma.taskRejection.deleteMany();
    await this.prisma.callReport.deleteMany();
    await this.prisma.task.deleteMany();

    const remainingUsers = await this.prisma.user.count();
    return { ok: true, remainingUsers };
  }

  async cleanupRedis() {
    if (!process.env.REDIS_URL) {
      return { ok: false, error: 'REDIS_URL is not configured' };
    }

    let redis: Redis | null = null;
    try {
      redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      await redis.ping();
      await redis.flushall();

      const keysAfter = await redis.keys('*');
      return { ok: true, remainingKeys: keysAfter.length };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    } finally {
      if (redis) {
        await redis.disconnect();
      }
    }
  }
}


