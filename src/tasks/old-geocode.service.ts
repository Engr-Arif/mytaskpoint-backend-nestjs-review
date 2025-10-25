import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import Bottleneck from 'bottleneck';
type Task = any;

const limiter = new Bottleneck({ maxConcurrent: 5, minTime: 250 });

@Injectable()
export class GeocodeService {
  constructor(private prisma: PrismaService) {}

  async fetchGeocode(task: Task): Promise<void> {
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        throw new Error('Google Maps API key is missing');
      }

      const url = `https://maps.googleapis.com/maps/api/geocode/json`;
      const response = await limiter.schedule(() =>
        axios.get(url, {
          params: {
            address: task.address,
            key: apiKey,
            region: 'bd',
          },
        })
      );

      const result = response.data.results?.[0];

      if (result) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            lat: result.geometry.location.lat,
            lon: result.geometry.location.lng,
            geocodePending: false,
            errorLog: null,
          },
        });
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            errorLog: 'No geocoding results found',
          },
        });
      }
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.error_message ||
        err?.message ||
        'Unknown geocode error';

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          errorLog: errorMsg,
        },
      });
    }
  }

  async batchGeocode(): Promise<{ message: string }> {
    const tasks = await this.prisma.task.findMany({
      where: { geocodePending: true },
    });

    await Promise.all(tasks.map((task) => this.fetchGeocode(task)));

    return { message: `Geocoding completed for ${tasks.length} tasks` };
  }
}
