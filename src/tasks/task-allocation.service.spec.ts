import { Test, TestingModule } from '@nestjs/testing';
import { TaskAllocationService } from './task-allocation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/services/cache.service';
import { RedisCacheService } from '../common/services/redis-cache.service';
import { TaskTransformerService } from './services/task-transformer.service';
import { SpatialIndexService } from './services/spatial-index.service';
import { PerformanceMonitorService } from './services/performance-monitor.service';
import { AdvancedCacheService } from './services/advanced-cache.service';

describe('TaskAllocationService', () => {
  let service: TaskAllocationService;

  const mockPrismaService = {
    task: {
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockCacheService = {
    getWorkers: jest.fn(),
  };

  const mockRedisCacheService = {
    invalidateWorkerTaskCache: jest.fn(),
    updateWorkerTaskSummaryCache: jest.fn(),
  };

  const mockTaskTransformerService = {
    getStandardSelect: jest.fn(),
    transformTasks: jest.fn(),
  };

  const mockSpatialIndexService = {
    buildSpatialIndex: jest.fn(),
    findNearbyWorkers: jest.fn(),
    getStats: jest.fn(),
    clear: jest.fn(),
  };

  const mockPerformanceMonitorService = {
    startOperation: jest.fn(),
    endOperation: jest.fn(),
    recordAllocationMetrics: jest.fn(),
    getPerformanceStats: jest.fn(),
    getAllocationTrends: jest.fn(),
  };

  const mockAdvancedCacheService = {
    cacheWorkersWithSpatialIndex: jest.fn(),
    cacheSpatialIndexStats: jest.fn(),
    cacheAllocationResults: jest.fn(),
    getCacheStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAllocationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: RedisCacheService, useValue: mockRedisCacheService },
        {
          provide: TaskTransformerService,
          useValue: mockTaskTransformerService,
        },
        { provide: SpatialIndexService, useValue: mockSpatialIndexService },
        {
          provide: PerformanceMonitorService,
          useValue: mockPerformanceMonitorService,
        },
        { provide: AdvancedCacheService, useValue: mockAdvancedCacheService },
      ],
    }).compile();

    service = module.get<TaskAllocationService>(TaskAllocationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('allocateTasks', () => {
    it('should allocate tasks to nearest available worker', async () => {
      const mockTasks = [
        {
          id: 'task1',
          lat: 23.8103,
          lon: 90.4125,
          status: 'unassigned',
          geocodePending: false,
        },
        {
          id: 'task2',
          lat: 23.8203,
          lon: 90.4225,
          status: 'unassigned',
          geocodePending: false,
        },
      ];

      const mockWorkers = [
        {
          id: 'worker1',
          lat: 23.81,
          lon: 90.412,
          role: 'WORKER',
          active: true,
        },
        {
          id: 'worker2',
          lat: 23.82,
          lon: 90.422,
          role: 'WORKER',
          active: true,
        },
      ];

      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockCacheService.getWorkers.mockResolvedValue(mockWorkers);
      mockPrismaService.task.update.mockResolvedValue({});
      mockPrismaService.task.count.mockResolvedValue(0);

      const result = await service.allocateTasks(100);

      expect(result.totalTasks).toBe(2);
      expect(result.allocated).toBe(2);
      expect(result.allocationFailed).toBe(0);
      expect(result.successRate).toBe(100);
    });

    it('should respect worker capacity limits', async () => {
      const mockTasks = [
        {
          id: 'task1',
          lat: 23.8103,
          lon: 90.4125,
          status: 'unassigned',
          geocodePending: false,
        },
      ];

      const mockWorkers = [
        {
          id: 'worker1',
          lat: 23.81,
          lon: 90.412,
          role: 'WORKER',
          active: true,
        },
      ];

      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockCacheService.getWorkers.mockResolvedValue(mockWorkers);
      mockPrismaService.task.count.mockResolvedValue(50);
      mockPrismaService.task.update.mockResolvedValue({});

      const result = await service.allocateTasks(100);

      expect(result.totalTasks).toBe(1);
      expect(result.allocated).toBe(0);
      expect(result.allocationFailed).toBe(1);
    });

    it('should handle edge cases (no workers, no tasks)', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockCacheService.getWorkers.mockResolvedValue([]);

      const result = await service.allocateTasks(100);

      expect(result.totalTasks).toBe(0);
      expect(result.allocated).toBe(0);
      expect(result.allocationFailed).toBe(0);
    });

    it('should prioritize distance over load when distances are similar', async () => {
      const mockTasks = [
        {
          id: 'task1',
          lat: 23.8103,
          lon: 90.4125,
          status: 'unassigned',
          geocodePending: false,
        },
      ];

      const mockWorkers = [
        {
          id: 'worker1',
          lat: 23.81,
          lon: 90.412,
          role: 'WORKER',
          active: true,
        },
        {
          id: 'worker2',
          lat: 23.8101,
          lon: 90.4121,
          role: 'WORKER',
          active: true,
        },
      ];

      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockCacheService.getWorkers.mockResolvedValue(mockWorkers);
      mockPrismaService.task.count.mockResolvedValue(0);

      const result = await service.allocateTasks(100);

      expect(result.allocated).toBe(1);
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaService.task.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(service.allocateTasks(100)).rejects.toThrow(
        'Task allocation failed: Database connection failed'
      );
    });
  });

  describe('getWorkerCurrentTaskCount', () => {
    it('should return current task count for worker', async () => {
      mockPrismaService.task.count.mockResolvedValue(5);

      const count = await (service as any).getWorkerCurrentTaskCount('worker1');

      expect(count).toBe(5);
      expect(mockPrismaService.task.count).toHaveBeenCalledWith({
        where: {
          assignedUserId: 'worker1',
          status: { in: ['assigned', 'accepted'] },
        },
      });
    });

    it('should return 0 on error', async () => {
      mockPrismaService.task.count.mockRejectedValue(
        new Error('Database error')
      );

      const count = await (service as any).getWorkerCurrentTaskCount('worker1');

      expect(count).toBe(0);
    });
  });

  describe('canWorkerAcceptTask', () => {
    it('should return true when worker has capacity', async () => {
      mockPrismaService.task.count.mockResolvedValue(10);

      const canAccept = await (service as any).canWorkerAcceptTask('worker1');

      expect(canAccept).toBe(true);
    });

    it('should return false when worker is at capacity', async () => {
      mockPrismaService.task.count.mockResolvedValue(50);

      const canAccept = await (service as any).canWorkerAcceptTask('worker1');

      expect(canAccept).toBe(false);
    });
  });
});
