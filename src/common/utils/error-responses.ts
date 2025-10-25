export class ErrorResponses {
  static userNotFound(publicId: number) {
    return {
      statusCode: 400,
      message: `User not found with publicId: ${publicId}`,
      error: 'Bad Request',
      details: {
        publicId,
        suggestion: 'Please verify the user exists and try again'
      }
    };
  }

  static userNotWorker(publicId: number, currentRole: string) {
    return {
      statusCode: 400,
      message: `User must be a worker. Current role: ${currentRole}`,
      error: 'Bad Request',
      details: {
        publicId,
        currentRole,
        suggestion: 'Only workers can have tasks assigned to them'
      }
    };
  }

  static userInactive(publicId: number) {
    return {
      statusCode: 400,
      message: 'User account is inactive. Please activate the user first.',
      error: 'Bad Request',
      details: {
        publicId,
        suggestion: 'Activate the user account before accessing their tasks'
      }
    };
  }

  static invalidStatus(status: string, validStatuses: string[]) {
    return {
      statusCode: 400,
      message: `Invalid status: ${status}`,
      error: 'Bad Request',
      details: {
        providedStatus: status,
        validStatuses,
        suggestion: `Use one of the valid statuses: ${validStatuses.join(', ')}`
      }
    };
  }

  static invalidPagination(parameter: string, value: any) {
    return {
      statusCode: 400,
      message: `${parameter} must be a positive integer`,
      error: 'Bad Request',
      details: {
        parameter,
        providedValue: value,
        suggestion: `Provide a valid positive integer for ${parameter}`
      }
    };
  }

  static limitExceeded(limit: number, maxLimit: number) {
    return {
      statusCode: 400,
      message: `Limit cannot exceed ${maxLimit}`,
      error: 'Bad Request',
      details: {
        providedLimit: limit,
        maxLimit,
        suggestion: `Use a limit between 1 and ${maxLimit}`
      }
    };
  }
}


