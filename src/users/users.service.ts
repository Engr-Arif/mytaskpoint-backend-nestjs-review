import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from '../common/utils/error.util';
import { Role } from '../common/enums/role.enum';
import * as argon2 from 'argon2';
import { CacheService } from '../common/services/cache.service';
import { RedisCacheService } from '../common/services/redis-cache.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private redisCache: RedisCacheService
  ) {}
  private readonly logger = new Logger(UsersService.name);

  private sanitizeUser(user: any) {
    if (!user) return user;

    const clone: any = { ...user };

    delete clone.passwordHash;
    delete clone.refreshTokenHash;
    delete clone.refreshToken;

    if (clone.passwordResets) delete clone.passwordResets;
    if (clone.otps) delete clone.otps;
    if (clone.taskOtps) delete clone.taskOtps;

    if (clone.callReports && Array.isArray(clone.callReports)) {
      clone.callReports = clone.callReports.map((r: any) => {
        const nr = { ...r };
        if (nr.caller && typeof nr.caller === 'object') {
          delete nr.caller.passwordHash;
          delete nr.caller.refreshTokenHash;
        }
        return nr;
      });
    }

    return clone;
  }

  async createUser(data: any, byUser: AuthUser) {
    const roleToCreate = data.role ?? Role.WORKER;
    if (!byUser || !byUser.role) {
      throw new ForbiddenException('Insufficient permissions');
    }

    let allowedRoles: Role[] = [];
    switch (byUser.role) {
      case Role.ADMIN:
        allowedRoles = [Role.MANAGER, Role.TERRITORY_OFFICER, Role.WORKER];
        break;
      case Role.MANAGER:
        allowedRoles = [Role.TERRITORY_OFFICER, Role.WORKER];
        break;
      case Role.TERRITORY_OFFICER:
        allowedRoles = [Role.WORKER];
        break;
      case Role.WORKER:
        allowedRoles = [];
        break;
    }

    if (!allowedRoles.includes(roleToCreate)) {
      throw new ForbiddenException(
        `Role ${byUser.role} cannot create role ${roleToCreate}`
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new ForbiddenException('Email already exists');
    }

    const passwordHash = await argon2.hash(data.password);

    const rest = { ...data } as any;
    delete rest.password;

    const newUser = await this.prisma.user.create({
      data: {
        ...rest,
        passwordHash,
        role: roleToCreate,
      },
    });

    if (newUser.role === 'WORKER' && newUser.active) {
      this.cacheService.addWorkerToCache(newUser);
    }

    await this.cacheService.invalidateAllUsersCache();

    return this.sanitizeUser(newUser);
  }

  async getAllUsers(byUser: AuthUser) {
    if (!byUser || !byUser.role) {
      throw new ForbiddenException();
    }

    if ([Role.ADMIN, Role.MANAGER].includes(byUser.role)) {
      const users = await this.cacheService.getAllUsersCached();
      if (Array.isArray(users)) return users.map((u) => this.sanitizeUser(u));
      return users;
    }
    throw new ForbiddenException();
  }

  async getUserById(id: string, byUser: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    if (!byUser || !byUser.role) {
      throw new ForbiddenException();
    }

    if (
      user.id !== byUser.id &&
      ![Role.ADMIN, Role.MANAGER].includes(byUser.role)
    ) {
      throw new ForbiddenException();
    }
    return this.sanitizeUser(user);
  }

  async updateUser(id: string, data: any, byUser: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    if (!byUser || !byUser.role) {
      throw new ForbiddenException();
    }

    if (
      user.id !== byUser.id &&
      ![Role.ADMIN, Role.MANAGER].includes(byUser.role)
    ) {
      throw new ForbiddenException();
    }

    if (user.role === Role.ADMIN && byUser.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    if (data.password) {
      data.passwordHash = await argon2.hash(data.password);
      delete data.password;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
    });

    try {
      if (updatedUser.role === 'WORKER') {
        const locationChanged =
          user.lat !== updatedUser.lat || user.lon !== updatedUser.lon;
        const statusChanged = user.active !== updatedUser.active;

        if (locationChanged) {
          await this.redisCache.invalidateSpatialIndexCache();
          this.logger.log(
            `Worker ${id} location changed - spatial index cache invalidated`
          );
        }

        if (statusChanged) {
          await this.redisCache.invalidateSpatialIndexCache();
          this.logger.log(
            `Worker ${id} status changed (${user.active} → ${updatedUser.active}) - spatial index cache invalidated`
          );
        }

        await this.redisCache.invalidateWorkerTaskCache(updatedUser.id);

        this.logger.log(
          `Worker ${id} profile updated - spatial and task caches invalidated (profile caching disabled)`
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Cache invalidation failed for worker profile update:`,
        getErrorMessage(error)
      );
    }

    return this.sanitizeUser(updatedUser);
  }

  async deleteUser(id: string, byUser: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    if (!byUser || !byUser.role) {
      throw new ForbiddenException();
    }

    if (![Role.ADMIN, Role.MANAGER].includes(byUser.role)) {
      throw new ForbiddenException();
    }

    if (user.role === Role.ADMIN && byUser.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    const deletedUser = await this.prisma.user.delete({ where: { id } });

    return this.sanitizeUser(deletedUser);
  }

  async getOwnProfile(byUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: byUser.id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async getActiveWorkers(byUser: AuthUser) {
    if (!byUser || !byUser.role) {
      throw new ForbiddenException(
        'Insufficient permissions to view active workers'
      );
    }

    if (
      byUser &&
      ![Role.ADMIN, Role.MANAGER, Role.TERRITORY_OFFICER].includes(byUser.role)
    ) {
      throw new ForbiddenException(
        'Insufficient permissions to view active workers'
      );
    }

    const workers = await this.cacheService.getWorkers();
    if (Array.isArray(workers)) return workers.map((w) => this.sanitizeUser(w));
    return workers;
  }
}
