import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Task } from '@prisma/client';

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class DistanceService {
  constructor(private prisma: PrismaService) {}

  async calculateNearestWorkers(): Promise<
    {
      taskId: string;
      taskTitle: string;
      nearestWorkerId: string | null;
      distanceKm: number | null;
    }[]
  > {
    const tasks: Task[] = await this.prisma.task.findMany({
      where: { geocodePending: false, status: 'unassigned' },
    });


    const workers: User[] = await this.prisma.user.findMany({
      where: {
        role: 'WORKER',
        lat: { not: null },
        lon: { not: null },
        active: true,
      },
    });

    const results: {
      taskId: string;
      taskTitle: string;
      nearestWorkerId: string | null;
      distanceKm: number | null;
    }[] = [];

    for (const task of tasks) {
      let nearestWorker: User | null = null;
      let minDist = Infinity;

      for (const worker of workers) {
        if (
          worker.lat === null ||
          worker.lon === null ||
          task.lat === null ||
          task.lon === null
        ) {
          continue;
        }

        const dist = haversine(task.lat, task.lon, worker.lat, worker.lon);
        if (dist < minDist && dist <= 10) {
          minDist = dist;
          nearestWorker = worker;
        }
      }

      results.push({
        taskId: task.id,
        taskTitle: task.title,
        nearestWorkerId: nearestWorker?.id ?? null,
        distanceKm: nearestWorker ? minDist : null,
      });
    }

    return results;
  }

  haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    return haversine(lat1, lon1, lat2, lon2);
  }
}
