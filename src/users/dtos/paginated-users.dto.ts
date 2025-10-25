export class TaskStatsDto {
  assigned!: number;
  accepted!: number;
  rejected!: number;
  completed!: number;
}

export class UserWithTasksDto {
  id!: string;
  email!: string;
  fullName!: string;
  role!: string;
  territory?: string;
  area?: string;
  district?: string;
  policeStation?: string;
  lat?: number;
  lon?: number;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  taskStats?: TaskStatsDto | null;
}

export class PaginatedUsersDto {
  users!: UserWithTasksDto[];
  nextCursor?: string;
}
