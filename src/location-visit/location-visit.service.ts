import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationVisitDto } from './dtos/create-location-visit.dto';
import { CheckinHistoryFilterDto } from './dtos/checkin-history-filter.dto';
import { User } from '@prisma/client';

@Injectable()
export class LocationVisitService {
  constructor(private prisma: PrismaService) {}

  async createLocationVisit(dto: CreateLocationVisitDto, user: User) {
    if (dto.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: dto.taskId },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
    }

    await this.prisma.locationVisit.create({
      data: {
        userId: user.id,
        taskId: dto.taskId ?? null,
        lat: dto.lat,
        lon: dto.lon,
        note: dto.note ?? null,
      },
    });

    return {
      success: true,
      message: 'Location visit recorded successfully',
      code: 201,
    };
  }

  async getLocationVisitsByUser(
    userId: string,
    page: number = 1,
    limit: number = 10
  ) {
    const skip = (page - 1) * limit;

    const [visits, total] = await Promise.all([
      this.prisma.locationVisit.findMany({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              publicId: true,
              role: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              address: true,
              customerName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.locationVisit.count({
        where: { userId },
      }),
    ]);

    return {
      data: visits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getLocationVisitsByTask(taskId: string) {
    return this.prisma.locationVisit.findMany({
      where: { taskId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            publicId: true,
            role: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            address: true,
            customerName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRecentLocationVisits(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [visits, total] = await Promise.all([
      this.prisma.locationVisit.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              publicId: true,
              role: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              address: true,
              customerName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.locationVisit.count(),
    ]);

    return {
      data: visits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getLocationVisitsByDateRange(
    startDate: Date,
    endDate: Date,
    page: number = 1,
    limit: number = 10
  ) {
    const skip = (page - 1) * limit;

    const [visits, total] = await Promise.all([
      this.prisma.locationVisit.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              publicId: true,
              role: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              address: true,
              customerName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.locationVisit.count({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    return {
      data: visits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getCheckinHistory(filters: CheckinHistoryFilterDto) {
    const {
      workerPublicId,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    if (startDate && endDate) {
      const parseLocal = (dateStr: string, endOfDay = false) => {
        const [yRaw, mRaw, dRaw] = dateStr
          .split('-')
          .map((v) => parseInt(v, 10));
        const y = yRaw ?? 1970;
        const m = mRaw ?? 1;
        const d = dRaw ?? 1;
        return endOfDay
          ? new Date(y, m - 1, d, 23, 59, 59, 999)
          : new Date(y, m - 1, d, 0, 0, 0, 0);
      };
      const start = parseLocal(startDate);
      const end = parseLocal(endDate, true);
      if (start > end) {
        throw new BadRequestException('Start date cannot be after end date');
      }
    }

    const where: any = {};

    if (workerPublicId) {
      where.user = {
        publicId: parseInt(workerPublicId),
      };
    }

    if (startDate || endDate) {
      const toLocalStartOfDay = (dateStr: string) => {
        const parts = dateStr.split('-').map((v) => parseInt(v, 10));
        const yNum = Number(parts[0]);
        const mNum = Number(parts[1]);
        const dNum = Number(parts[2]);
        const y: number = Number.isFinite(yNum) ? yNum : 1970;
        const m: number = Number.isFinite(mNum) ? mNum : 1;
        const d: number = Number.isFinite(dNum) ? dNum : 1;
        const mMinusOne: number = m - 1;
        return new Date(y, mMinusOne, d, 0, 0, 0, 0);
      };
      const toLocalEndOfDay = (dateStr: string) => {
        const parts = dateStr.split('-').map((v) => parseInt(v, 10));
        const yNum = Number(parts[0]);
        const mNum = Number(parts[1]);
        const dNum = Number(parts[2]);
        const y: number = Number.isFinite(yNum) ? yNum : 1970;
        const m: number = Number.isFinite(mNum) ? mNum : 1;
        const d: number = Number.isFinite(dNum) ? dNum : 1;
        const mMinusOne: number = m - 1;
        return new Date(y, mMinusOne, d, 23, 59, 59, 999);
      };

      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = toLocalStartOfDay(startDate);
      }
      if (endDate) {
        where.createdAt.lte = toLocalEndOfDay(endDate);
      }
    }

    const validSortFields = ['createdAt', 'updatedAt'];
    const validSortOrders = ['asc', 'desc'];

    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = validSortOrders.includes(sortOrder.toLowerCase())
      ? (sortOrder.toLowerCase() as 'asc' | 'desc')
      : 'desc';

    const skip = (page - 1) * limit;

    const [visits, total] = await Promise.all([
      this.prisma.locationVisit.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              publicId: true,
              role: true,
              email: true,
              phone: true,
              territory: true,
              district: true,
              policeStation: true,
              area: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              address: true,
              customerName: true,
              phone: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { [sortField]: sortDirection },
        skip,
        take: limit,
      }),
      this.prisma.locationVisit.count({ where }),
    ]);

    return {
      message: 'Check-in history fetched successfully',
      data: visits,
      filters: {
        workerPublicId: workerPublicId || 'all',
        startDate: startDate || 'all',
        endDate: endDate || 'all',
        sortBy: sortField,
        sortOrder: sortDirection,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }
}
