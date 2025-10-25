import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CsvService } from './csv.service';
import { GeocodeService } from './geocode.service';
import { DistanceService } from './distance.service';
import { TaskAllocationService } from './task-allocation.service';
import { TaskController } from './tasks.controller';
import { CacheService } from '../common/services/cache.service';
import { RedisCacheService } from '../common/services/redis-cache.service';
import { TaskTransformerService } from './services/task-transformer.service';
import { SpatialIndexService } from './services/spatial-index.service';
import { PerformanceMonitorService } from './services/performance-monitor.service';
import { AdvancedCacheService } from './services/advanced-cache.service';

@Module({
  imports: [],
  controllers: [TaskController],
  providers: [
    PrismaService,
    CsvService,
    GeocodeService,
    DistanceService,
    TaskAllocationService,
    CacheService,
    RedisCacheService,
    TaskTransformerService,
    SpatialIndexService,
    PerformanceMonitorService,
    AdvancedCacheService,
  ],
})
export class TaskModule {}
