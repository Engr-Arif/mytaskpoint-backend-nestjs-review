import { Injectable, Logger } from '@nestjs/common';

interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  metadata?: Record<string, any>;
}

interface AllocationMetrics {
  totalTasks: number;
  allocated: number;
  failed: number;
  successRate: number;
  duration: number;
  spatialIndexStats?: any;
  avgDistance?: number;
  workerUtilization?: number;
}

@Injectable()
export class PerformanceMonitorService {
  private metrics: PerformanceMetrics[] = [];
  private readonly MAX_METRICS = 1000;
  private readonly logger = new Logger(PerformanceMonitorService.name);

  startOperation(operation: string, metadata?: Record<string, any>): string {
    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.metrics.push({
      operation: operationId,
      startTime: Date.now(),
      success: false,
      metadata: { ...metadata, operation },
    });

    return operationId;
  }

  endOperation(
    operationId: string,
    success: boolean,
    metadata?: Record<string, any>
  ): void {
    const metric = this.metrics.find((m) => m.operation === operationId);
    if (metric) {
      metric.endTime = Date.now();
      metric.duration = metric.endTime - metric.startTime;
      metric.success = success;
      metric.metadata = { ...metric.metadata, ...metadata };
    }

    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  recordAllocationMetrics(metrics: AllocationMetrics): void {
    this.logger.log(
      `Allocation Performance Metrics: total=${metrics.totalTasks} allocated=${metrics.allocated} failed=${metrics.failed} successRate=${metrics.successRate.toFixed(2)}% duration=${metrics.duration}ms avgDistance=${metrics.avgDistance ? metrics.avgDistance.toFixed(2) + 'km' : 'N/A'} workerUtilization=${metrics.workerUtilization ? metrics.workerUtilization.toFixed(2) + '%' : 'N/A'}`
    );
  }

  getPerformanceStats(operation?: string): {
    totalOperations: number;
    successRate: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    recentMetrics: PerformanceMetrics[];
  } {
    const relevantMetrics = operation
      ? this.metrics.filter((m) => m.metadata?.operation === operation)
      : this.metrics;

    const completedMetrics = relevantMetrics.filter(
      (m) => m.duration !== undefined
    );

    const totalOperations = completedMetrics.length;
    const successfulOperations = completedMetrics.filter(
      (m) => m.success
    ).length;
    const successRate =
      totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

    const durations = completedMetrics.map((m) => m.duration ?? 0);
    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

    return {
      totalOperations,
      successRate,
      avgDuration,
      minDuration,
      maxDuration,
      recentMetrics: completedMetrics.slice(-10),
    };
  }

  getAllocationTrends(): {
    recentAllocations: AllocationMetrics[];
    avgSuccessRate: number;
    avgDuration: number;
    performanceTrend: 'improving' | 'stable' | 'declining';
  } {
    const allocationMetrics = this.metrics
      .filter(
        (m) =>
          m.metadata?.operation === 'allocateTasksOptimized' &&
          m.metadata?.allocationMetrics
      )
      .map((m) => m.metadata?.allocationMetrics as AllocationMetrics)
      .slice(-20);

    const avgSuccessRate =
      allocationMetrics.length > 0
        ? allocationMetrics.reduce((sum, m) => sum + m.successRate, 0) /
          allocationMetrics.length
        : 0;

    const avgDuration =
      allocationMetrics.length > 0
        ? allocationMetrics.reduce((sum, m) => sum + m.duration, 0) /
          allocationMetrics.length
        : 0;

    let performanceTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (allocationMetrics.length >= 10) {
      const firstHalf = allocationMetrics.slice(
        0,
        Math.floor(allocationMetrics.length / 2)
      );
      const secondHalf = allocationMetrics.slice(
        Math.floor(allocationMetrics.length / 2)
      );

      const firstHalfAvg =
        firstHalf.reduce((sum, m) => sum + m.successRate, 0) / firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((sum, m) => sum + m.successRate, 0) /
        secondHalf.length;

      const improvement = secondHalfAvg - firstHalfAvg;
      if (improvement > 5) performanceTrend = 'improving';
      else if (improvement < -5) performanceTrend = 'declining';
    }

    return {
      recentAllocations: allocationMetrics,
      avgSuccessRate,
      avgDuration,
      performanceTrend,
    };
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  exportMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }
}
