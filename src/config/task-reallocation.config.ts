import { TaskStatus } from '@prisma/client';

// Configuration for task reallocation permissions
// Controls which task statuses can be reallocated by admin

export interface TaskReallocationConfig {
  // Allow reallocation of tasks with these statuses
  // Set to false to disable reallocation for that status

  allowedStatuses: {
    [TaskStatus.unassigned]: boolean;
    [TaskStatus.assigned]: boolean;
    [TaskStatus.accepted]: boolean;
    [TaskStatus.rejected]: boolean;
    [TaskStatus.completed]: boolean;
  };

  // Default behavior when status is not explicitly configured

  defaultAllowReallocation: boolean;

  // Custom error message when reallocation is not allowed

  errorMessages: {
    [key: string]: string;
  };
}

// Default configuration for task reallocation

export const defaultTaskReallocationConfig: TaskReallocationConfig = {
  allowedStatuses: {
    [TaskStatus.unassigned]: true,
    [TaskStatus.assigned]: true,
    [TaskStatus.accepted]: true,
    [TaskStatus.rejected]: true,
    [TaskStatus.completed]: false,
  },
  defaultAllowReallocation: false,
  errorMessages: {
    [TaskStatus.unassigned]: 'Unassigned tasks cannot be reallocated',
    [TaskStatus.assigned]: 'Assigned tasks cannot be reallocated',
    [TaskStatus.accepted]: 'Accepted tasks cannot be reallocated',
    [TaskStatus.rejected]: 'Rejected tasks cannot be reallocated',
    [TaskStatus.completed]: 'Completed tasks cannot be reallocated',
    default: 'Task reallocation is not allowed for this status',
  },
};

// Load task reallocation configuration from environment variables
// Environment variables format: TASK_REALLOCATION_<STATUS>=true/false
// Example: TASK_REALLOCATION_COMPLETED=true

export function loadTaskReallocationConfig(): TaskReallocationConfig {
  const config = { ...defaultTaskReallocationConfig };

  Object.values(TaskStatus).forEach((status) => {
    const envVar = `TASK_REALLOCATION_${status.toUpperCase()}`;
    const envValue = process.env[envVar];

    if (envValue !== undefined) {
      config.allowedStatuses[status] = envValue.toLowerCase() === 'true';
    }
  });

  const defaultEnv = process.env.TASK_REALLOCATION_DEFAULT;
  if (defaultEnv !== undefined) {
    config.defaultAllowReallocation = defaultEnv.toLowerCase() === 'true';
  }

  return config;
}

// Check if a task status can be reallocated based on configuration

export function canReallocateTask(
  status: TaskStatus,
  config: TaskReallocationConfig
): boolean {
  if (config.allowedStatuses[status] !== undefined) {
    return config.allowedStatuses[status];
  }

  return config.defaultAllowReallocation;
}

// Get error message for a task status

export function getReallocationErrorMessage(
  status: TaskStatus,
  config: TaskReallocationConfig
): string {
  const msg = config.errorMessages[String(status)];
  return (
    msg ??
    config.errorMessages['default'] ??
    'Task reallocation is not allowed for this status'
  );
}
