import * as _PrismaClient from '@prisma/client';

declare module '@prisma/client' {}

export type TaskStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'rejected'
  | 'completed';

export type Prisma = {
  TaskCreateManyInput: any;
};

const RealTaskStatus = ((_PrismaClient as any).TaskStatus ?? null) as unknown;
if (RealTaskStatus) {
  (module.exports as any).TaskStatus = RealTaskStatus;
}
