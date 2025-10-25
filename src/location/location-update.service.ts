import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from '../common/utils/error.util';

@Injectable()
export class LocationChangeRequestService {
  private readonly logger = new Logger(LocationChangeRequestService.name);
  constructor(private prisma: PrismaService) {}

  async requestLocationChange(userId: string, lat: number, lon: number) {
    try {
      if (lat < -90 || lat > 90) {
        throw new Error('Invalid latitude: must be between -90 and 90');
      }
      if (lon < -180 || lon > 180) {
        throw new Error('Invalid longitude: must be between -180 and 180');
      }

      return await this.prisma.locationChangeRequest.create({
        data: { userId, lat, lon },
      });
    } catch (error: unknown) {
      this.logger.error(
        'Error creating location change request:',
        getErrorMessage(error)
      );
      throw error;
    }
  }

  async getPendingRequests() {
    try {
      return await this.prisma.locationChangeRequest.findMany({
        where: { status: 'PENDING' },
        include: { user: true },
      });
    } catch (error: unknown) {
      this.logger.error(
        'Error fetching pending requests:',
        getErrorMessage(error)
      );
      throw error;
    }
  }

  async approveRequest(id: string, adminId: string) {
    const request = await this.prisma.locationChangeRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found');

    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
    });

    await this.prisma.user.update({
      where: { id: request.userId },
      data: { lat: request.lat, lon: request.lon },
    });

    if (user && user.role === 'WORKER') {
      this.logger.log(
        `Worker ${request.userId} location updated: (${user.lat}, ${user.lon}) → (${request.lat}, ${request.lon})`
      );
      this.logger.log(
        `Note: Cache invalidation not available in this service - consider implementing cache update in task allocation service`
      );
    }

    return this.prisma.locationChangeRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: adminId },
    });
  }

  async rejectRequest(id: string, adminId: string, reason?: string) {
    return this.prisma.locationChangeRequest.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: adminId, reason: reason ?? null },
    });
  }
}
