import { Injectable } from '@nestjs/common';

interface SpatialPoint {
  id: string;
  lat: number;
  lon: number;
  data: unknown;
}

@Injectable()
export class SpatialIndexService {
  private spatialIndex: Map<string, SpatialPoint[]> = new Map();
  private readonly GRID_SIZE = 0.01;

  /**
   * Build spatial index for workers
   */
  buildSpatialIndex(workers: Record<string, unknown>[]): void {
    this.spatialIndex.clear();
    workers.forEach((workerRaw) => {
      const worker = workerRaw as any;
      if (worker.lat && worker.lon) {
        const gridKey = this.getGridKey(worker.lat, worker.lon);

        if (!this.spatialIndex.has(gridKey)) {
          this.spatialIndex.set(gridKey, []);
        }

        const arr = this.spatialIndex.get(gridKey);
        if (arr) {
          arr.push({
            id: worker.id,
            lat: worker.lat,
            lon: worker.lon,
            data: worker,
          });
        }
      }
    });
  }

  /**
   * Find nearby workers using spatial index
   */
  findNearbyWorkers(
    taskLat: number,
    taskLon: number,
    radiusKm: number
  ): SpatialPoint[] {
    const nearbyWorkers: SpatialPoint[] = [];
    const searchRadius = radiusKm / 111;

    const searchCells = this.getSearchCells(taskLat, taskLon, searchRadius);

    for (const cellKey of searchCells) {
      const workersInCell = this.spatialIndex.get(cellKey) || [];

      for (const worker of workersInCell) {
        const distance = this.haversineDistance(
          taskLat,
          taskLon,
          worker.lat,
          worker.lon
        );

        if (distance <= radiusKm) {
          nearbyWorkers.push(worker);
        }
      }
    }

    return nearbyWorkers;
  }

  /**
   * Get grid key for coordinates
   */
  private getGridKey(lat: number, lon: number): string {
    const gridLat = Math.floor(lat / this.GRID_SIZE);
    const gridLon = Math.floor(lon / this.GRID_SIZE);
    return `${gridLat},${gridLon}`;
  }

  /**
   * Get grid cells to search for given radius
   */
  private getSearchCells(lat: number, lon: number, radius: number): string[] {
    const cells: string[] = [];
    const gridRadius = Math.ceil(radius / this.GRID_SIZE);

    const centerLat = Math.floor(lat / this.GRID_SIZE);
    const centerLon = Math.floor(lon / this.GRID_SIZE);

    for (let latOffset = -gridRadius; latOffset <= gridRadius; latOffset++) {
      for (let lonOffset = -gridRadius; lonOffset <= gridRadius; lonOffset++) {
        const cellKey = `${centerLat + latOffset},${centerLon + lonOffset}`;
        cells.push(cellKey);
      }
    }

    return cells;
  }

  /**
   * Haversine distance calculation
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
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

  /**
   * Clear spatial index
   */
  clear(): void {
    this.spatialIndex.clear();
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalWorkers: number;
    gridCells: number;
    avgWorkersPerCell: number;
  } {
    let totalWorkers = 0;
    const gridCells = this.spatialIndex.size;

    for (const workers of this.spatialIndex.values()) {
      if (Array.isArray(workers)) totalWorkers += workers.length;
    }

    return {
      totalWorkers,
      gridCells,
      avgWorkersPerCell: gridCells > 0 ? totalWorkers / gridCells : 0,
    };
  }
}
