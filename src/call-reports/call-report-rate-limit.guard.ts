import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class CallReportRateLimitGuard implements CanActivate {
  private requestCounts = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private readonly RATE_LIMIT = 100;
  private readonly WINDOW_MS = 60 * 1000;

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const clientId = this.getClientId(request);
    const now = Date.now();


    this.cleanupExpiredEntries(now);

    const clientData = this.requestCounts.get(clientId);

    if (!clientData) {
      this.requestCounts.set(clientId, {
        count: 1,
        resetTime: now + this.WINDOW_MS,
      });
      return true;
    }

    if (now > clientData.resetTime) {

      this.requestCounts.set(clientId, {
        count: 1,
        resetTime: now + this.WINDOW_MS,
      });
      return true;
    }

    if (clientData.count >= this.RATE_LIMIT) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    clientData.count++;
    return true;
  }

  private getClientId(request: any): string {

    const ip = request.ip || request.connection.remoteAddress;
    const userId = request.user?.id || 'anonymous';
    return `${ip}-${userId}`;
  }

  private cleanupExpiredEntries(now: number) {
    for (const [key, data] of this.requestCounts.entries()) {
      if (now > data.resetTime) {
        this.requestCounts.delete(key);
      }
    }
  }
}
