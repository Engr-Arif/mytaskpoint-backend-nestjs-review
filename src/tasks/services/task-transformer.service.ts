import { Injectable } from '@nestjs/common';
import {
  TaskResponseDto,
  TaskLocationDto,
  TaskCustomerDto,
  TaskProductDto,
  TaskOrderDto,
  TaskAddressDto,
  TaskTimestampsDto,
  TaskAssignmentDto,
  TaskRejectionDto,
} from '../dtos/task-response.dto';

@Injectable()
export class TaskTransformerService {
  transformTask(task: Record<string, unknown>): TaskResponseDto {
    const t = task as any;
    const base: Record<string, unknown> = {
      id: t.id,
      title: t.title,
      address: t.address,
      location: this.transformLocation(t),
      customer: this.transformCustomer(t),
      product: this.transformProduct(t),
      order: this.transformOrder(t),
      addressDetails: this.transformAddressDetails(t),
      status: t.status,
      timestamps: this.transformTimestamps(t),
    };

    const assignment = this.transformAssignment(task);
    if (assignment) base.assignment = assignment;

    const rejections = this.transformRejectionHistory(task);
    if (rejections) base.rejectionHistory = rejections;

    return base as unknown as TaskResponseDto;
  }

  transformTasks(tasks: Record<string, unknown>[]): TaskResponseDto[] {
    return tasks.map((task) => this.transformTask(task));
  }

  private transformLocation(task: Record<string, unknown>): TaskLocationDto {
    const t = task as any;
    return {
      lat: t.lat,
      lon: t.lon,
    };
  }

  private transformCustomer(task: Record<string, unknown>): TaskCustomerDto {
    const t = task as any;
    return {
      name: t.customerName,
      phone: t.phone,
    };
  }

  private transformProduct(task: Record<string, unknown>): TaskProductDto {
    const t = task as any;
    return {
      name: t.productName,
      type: t.productType,
      code: t.productCode,
      qty: t.qty,
      mrp: t.mrp,
      unitPriceExVat: t.unitPriceExVat,
      unitPriceIncVat: t.unitPriceIncVat,
    };
  }

  private transformOrder(task: Record<string, unknown>): TaskOrderDto {
    const t = task as any;
    return {
      status: t.orderStatus,
      requisitionDate: t.requisitionDate,
      requisitionTime: t.requisitionTime,
      transactionNumber: t.transactionNumber,
      invoiceAmount: t.invoiceAmount,
      paymentMode: t.paymentMode,
      deliveryPartner: t.deliveryPartner,
    };
  }

  private transformAddressDetails(
    task: Record<string, unknown>
  ): TaskAddressDto {
    const t = task as any;
    return {
      area: t.area,
      city: t.city,
      thana: t.thana,
    };
  }

  private transformTimestamps(
    task: Record<string, unknown>
  ): TaskTimestampsDto {
    const t = task as any;
    return {
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      assignedAt: t.assignedAt,
    };
  }

  private transformAssignment(
    task: Record<string, unknown>
  ): TaskAssignmentDto | undefined {
    const assignedUser = (task as any).assignedUser;
    if (!assignedUser) return undefined;

    return {
      assignedTo: assignedUser.fullName,
      assignedAt: (task as any).assignedAt || (task as any).updatedAt,
      worker: {
        id: assignedUser.id,
        name: assignedUser.fullName,
        email: assignedUser.email,
        phone: assignedUser.phone ?? null,
        publicId: assignedUser.publicId,
        area: assignedUser.area,
        district: assignedUser.district,
        policeStation: assignedUser.policeStation,
      },
    };
  }

  private transformRejectionHistory(
    task: Record<string, unknown>
  ): TaskRejectionDto[] | undefined {
    const rejections = (task as any).rejections;
    if (!rejections || rejections.length === 0) return undefined;

    return rejections.map((rejection: any) => ({
      rejectedBy: rejection.user?.fullName || 'Unknown',
      reason: rejection.reason,
      rejectedAt: rejection.createdAt,
    }));
  }

  getStandardSelect() {
    return {
      id: true,
      title: true,
      address: true,
      lat: true,
      lon: true,
      customerName: true,
      phone: true,
      productName: true,
      productType: true,
      productCode: true,
      qty: true,
      mrp: true,
      unitPriceExVat: true,
      unitPriceIncVat: true,
      orderStatus: true,
      requisitionDate: true,
      requisitionTime: true,
      transactionNumber: true,
      invoiceAmount: true,
      paymentMode: true,
      deliveryPartner: true,
      area: true,
      city: true,
      thana: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      assignedAt: true,
      assignedUser: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          publicId: true,
          area: true,
          district: true,
          policeStation: true,
          territory: true,
        },
      },
      rejections: {
        select: {
          reason: true,
          createdAt: true,
          user: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
      },
    };
  }
}
