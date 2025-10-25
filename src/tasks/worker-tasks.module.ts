import { Module } from '@nestjs/common';
import { WorkerTasksService } from './worker-tasks.service';
import { WorkerTasksController } from './worker-tasks.controller';
import { PrismaService } from '../prisma/prisma.service';
import { CallReportService } from '../call-reports/call-report.service';
import { TaskTransformerService } from './services/task-transformer.service';
import { RedisCacheService } from '../common/services/redis-cache.service';

@Module({
  imports: [],
  controllers: [WorkerTasksController],
  providers: [
    WorkerTasksService,
    PrismaService,
    CallReportService,
    TaskTransformerService,
    RedisCacheService,
  ],
  exports: [WorkerTasksService, RedisCacheService],
})
export class WorkerTasksModule {}
