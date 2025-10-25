import { Module } from '@nestjs/common';
import { AdminTasksController } from './admin-tasks.controller';
import { AdminTasksService } from './admin-tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/services/cache.service';
import { RedisCacheService } from '../common/services/redis-cache.service';
import { TaskTransformerService } from './services/task-transformer.service';

@Module({
  controllers: [AdminTasksController],
  providers: [
    AdminTasksService,
    PrismaService,
    CacheService,
    RedisCacheService,
    TaskTransformerService,
  ],
})
export class AdminTasksModule {}
