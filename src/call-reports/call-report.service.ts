import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCallReportDto } from './dtos/create-call-report.dto';
import { getErrorMessage } from '../common/utils/error.util';
import type { User, CallResult, DeliveryPossibility } from '@prisma/client';
import { Logger } from '@nestjs/common';

enum CallStatus {
  ACTIVE = 'ACTIVE',
  DISMISS = 'DISMISS',
}

@Injectable()
export class CallReportService {
  private readonly logger = new Logger(CallReportService.name);
  constructor(private prisma: PrismaService) {}

  async createCallReport(dto: CreateCallReportDto, user: User) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (!dto.callResult) {
      throw new BadRequestException('callResult is required');
    }
    if (!dto.deliveryPossibility) {
      throw new BadRequestException('deliveryPossibility is required');
    }

    try {
      return this.prisma.callReport.create({
        data: {
          ...dto,
          callerId: user.id,
          callerRole: user.role,
          callStartTime: new Date(dto.callStartTime),
          callEndTime: new Date(dto.callEndTime),
          callResult: String(dto.callResult) as unknown as CallResult,
          deliveryPossibility: String(
            dto.deliveryPossibility
          ) as unknown as DeliveryPossibility,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create call report:',
        getErrorMessage(error)
      );
      throw error;
    }
  }

  async getCallsByTask(
    taskId: string,
    activeOnly = false,
    page = 1,
    limit = 20
  ) {
    const where: any = {
      taskId,
      ...(activeOnly && { status: 'ACTIVE' }),
    };

    const total = await this.prisma.callReport.count({ where });

    const calls = await this.prisma.callReport.findMany({
      where,
      select: {
        id: true,
        callerRole: true,
        callStartTime: true,
        callResult: true,
        notes: true,
        deliveryPossibility: true,
        status: true,
        caller: {
          select: {
            fullName: true,
            publicId: true,
          },
        },
      },
      orderBy: { callStartTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      calls,
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

  async getCallsByUser(userId: string, page = 1, limit = 20) {
    const where = { callerId: userId };

    const total = await this.prisma.callReport.count({ where });

    const calls = await this.prisma.callReport.findMany({
      where,
      select: {
        id: true,
        callerId: true,
        callStartTime: true,
        callResult: true,
        notes: true,
        deliveryPossibility: true,
        status: true,
        caller: {
          select: {
            fullName: true,
            publicId: true,
          },
        },
      },
      orderBy: { callStartTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      calls,
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

  async updateCallStatus(id: string, status: CallStatus) {
    const callReport = await this.prisma.callReport.findUnique({
      where: { id },
    });
    if (!callReport) throw new NotFoundException('Call report not found');

    return this.prisma.callReport.update({
      where: { id },
      data: { status },
    });
  }

  async dismissAllCallsForTask(taskId: string) {
    return this.prisma.callReport.updateMany({
      where: {
        taskId,
        status: 'ACTIVE',
      },
      data: {
        status: 'DISMISS',
      },
    });
  }

  async adminBulkDismissByTaskId(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const result = await this.prisma.callReport.updateMany({
      where: {
        taskId,
        status: 'ACTIVE',
      },
      data: {
        status: 'DISMISS',
      },
    });

    return {
      message: `Successfully dismissed ${result.count} call(s) for task ${taskId}`,
      taskId,
      dismissedCount: result.count,
    };
  }

  async getCallDashboard(filters: {
    status?: CallStatus;
    callResult?: string;
    deliveryPossibility?: string;
    callerRole?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      status,
      callResult,
      deliveryPossibility,
      callerRole,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = filters;

    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const where: any = {};

    if (status) where.status = status;
    if (callResult) where.callResult = callResult;
    if (deliveryPossibility) where.deliveryPossibility = deliveryPossibility;
    if (callerRole) where.callerRole = callerRole;

    if (startDate || endDate) {
      where.callStartTime = {};
      if (startDate) where.callStartTime.gte = new Date(startDate);
      if (endDate) where.callStartTime.lte = new Date(endDate);
    }

    const total = await this.prisma.callReport.count({ where });

    const calls = await this.prisma.callReport.findMany({
      where,
      select: {
        id: true,
        taskId: true,
        callerId: true,
        callerRole: true,
        callStartTime: true,
        callEndTime: true,
        callResult: true,
        deliveryPossibility: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        caller: {
          select: {
            id: true,
            fullName: true,
            publicId: true,
            email: true,
            role: true,
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
          },
        },
      },
      orderBy: { callStartTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      calls,
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
