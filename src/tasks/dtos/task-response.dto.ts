import { TaskStatus } from '../../prisma/types';

export class TaskLocationDto {
  lat!: number | null;
  lon!: number | null;
}

export class TaskCustomerDto {
  name!: string | null;
  phone!: string | null;
}

export class TaskProductDto {
  name!: string | null;
  type!: string | null;
  code!: string | null;
  qty!: number | null;
  mrp!: number | null;
  unitPriceExVat!: number | null;
  unitPriceIncVat!: number | null;
}

export class TaskOrderDto {
  status!: string | null;
  requisitionDate!: string | null;
  requisitionTime!: string | null;
  transactionNumber!: string | null;
  invoiceAmount!: number | null;
  paymentMode!: string | null;
  deliveryPartner!: string | null;
}

export class TaskAddressDto {
  area!: string | null;
  city!: string | null;
  thana!: string | null;
}

export class TaskTimestampsDto {
  createdAt!: Date;
  updatedAt!: Date;
  assignedAt!: Date | null;
}

export class TaskWorkerDto {
  id!: string;
  name!: string;
  email!: string;
  phone!: string | null;
  publicId!: number;
  area!: string | null;
  district!: string | null;
  policeStation!: string | null;
}

export class TaskAssignmentDto {
  assignedTo!: string;
  assignedAt!: Date;
  worker!: TaskWorkerDto;
}

export class TaskRejectionDto {
  rejectedBy!: string;
  reason!: string;
  rejectedAt!: Date;
}

export class TaskResponseDto {
  id!: string;
  title!: string;
  address!: string;
  location!: TaskLocationDto;
  customer!: TaskCustomerDto;
  product!: TaskProductDto;
  order!: TaskOrderDto;
  addressDetails!: TaskAddressDto;
  status!: TaskStatus;
  timestamps!: TaskTimestampsDto;
  assignment?: TaskAssignmentDto;
  rejectionHistory?: TaskRejectionDto[];
}

export class PaginatedTasksResponseDto {
  data!: TaskResponseDto[];
  meta!: {
    total: number;
    page: number;
    lastPage: number;
    limit: number;
  };
}

export class TaskSummaryResponseDto {
  unassigned!: number;
  assigned!: number;
  accepted!: number;
  completed!: number;
  rejected!: number;
  total!: number;
}
