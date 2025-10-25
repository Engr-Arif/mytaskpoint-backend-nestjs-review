import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { getErrorMessage } from '../common/utils/error.util';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/enums/role.enum';
import type { User } from '@prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private redis: InstanceType<typeof Redis>;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService
  ) {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl)
        throw new Error('REDIS_URL environment variable is not set');

      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redis.on('error', (err: any) => {
        this.logger.error('Redis connection error:', err);
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected successfully');
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  async register(
    data: {
      email: string;
      password: string;
      fullName: string;
      territory?: string;
      role?: Role;
    },
    byUser?: { role: Role }
  ) {
    try {
      const role =
        byUser?.role === Role.ADMIN && data.role ? data.role : Role.WORKER;

      const hash = await argon2.hash(data.password);

      const created = await this.prisma.user.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          role,
          territory: data.territory ?? null,
          passwordHash: hash,
        },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          publicId: true,
          email: true,
          fullName: true,
          role: true,
          territory: true,
          district: true,
          policeStation: true,
          area: true,
          lat: true,
          lon: true,
          active: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const tokens = await this.issueTokens(created);
      await this.storeRefresh(created.id, tokens.refreshToken);

      return { user, ...tokens };
    } catch (err: unknown) {
      this.logger.error('User registration failed', {
        error: getErrorMessage(err),
        email: data.email,
        stack: (err as unknown as { stack?: string })?.stack ?? undefined,
      });
      throw err;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new ForbiddenException('Invalid credentials');
    }

    if (!user.active) {
      throw new ForbiddenException('Account is deactivated');
    }

    const tokens = await this.issueTokens(user);
    await this.storeRefresh(user.id, tokens.refreshToken);

    const safeUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        publicId: true,
        email: true,
        fullName: true,
        role: true,
        territory: true,
        district: true,
        policeStation: true,
        area: true,
        lat: true,
        lon: true,
        active: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { user: safeUser, ...tokens };
  }

  async refresh(user: AuthUser) {
    try {
      const key = `rt:${user.id}`;
      const storedHash = await this.redis.get(key);

      if (!storedHash) throw new ForbiddenException('No refresh token found');

      // Fetch full user record from DB to perform checks and issue tokens
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      if (!dbUser) throw new ForbiddenException('User not found');

      if (dbUser.active === false) {
        throw new ForbiddenException('Account is deactivated');
      }

      const tokens = await this.issueTokens(dbUser);
      await this.storeRefresh(dbUser.id, tokens.refreshToken);

      const safeUser = await this.prisma.user.findUnique({
        where: { id: dbUser.id },
        select: {
          id: true,
          publicId: true,
          email: true,
          fullName: true,
          role: true,
          territory: true,
          district: true,
          policeStation: true,
          area: true,
          lat: true,
          lon: true,
          active: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return { user: safeUser, ...tokens };
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        'Refresh token validation failed:',
        getErrorMessage(error)
      );
      throw new ForbiddenException('Invalid refresh token');
    }
  }

  async logout(user: AuthUser) {
    try {
      await this.redis.del(`rt:${user.id}`);
      return { success: true };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to delete refresh token from Redis:',
        getErrorMessage(error)
      );
      return { success: true };
    }
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ) {
    try {
      this.logger.log(`Password change attempt for user: ${userId}`);

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`Password change failed: User not found - ${userId}`);
        throw new ForbiddenException('User not found');
      }

      const isOldPasswordValid = await argon2.verify(
        user.passwordHash,
        oldPassword
      );
      if (!isOldPasswordValid) {
        this.logger.warn(
          `Password change failed: Invalid old password for user - ${userId}`
        );
        throw new ForbiddenException('Current password is incorrect');
      }

      const isSamePassword = await argon2.verify(
        user.passwordHash,
        newPassword
      );
      if (isSamePassword) {
        this.logger.warn(
          `Password change failed: New password same as old password for user - ${userId}`
        );
        throw new ForbiddenException(
          'New password must be different from current password'
        );
      }

      const newPasswordHash = await argon2.hash(newPassword);

      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      await this.redis.del(`rt:${userId}`);

      this.logger.log(`Password changed successfully for user: ${userId}`);
      return { success: true, message: 'Password changed successfully' };
    } catch (err: unknown) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error('Password change failed', {
        error: getErrorMessage(err),
        userId,
        stack: (err as unknown as { stack?: string })?.stack ?? undefined,
      });
      throw new ForbiddenException(
        'Failed to change password. Please try again.'
      );
    }
  }

  async forgotPassword(email: string) {
    try {
      this.logger.log(`Forgot password request for email: ${email}`);

      const user = await this.prisma.user.findFirst({
        where: { email },
      });

      if (!user) {
        this.logger.log(`Forgot password: Email not found - ${email}`);
        return {
          success: true,
          message:
            'If this email is registered, you will receive an OTP on your registered phone number',
        };
      }

      this.logger.log(`Forgot password: User found for email - ${email}`);

      return {
        success: true,
        message:
          'If this email is registered, you will receive an OTP on your registered phone number',
      };
    } catch (error: unknown) {
      this.logger.error(`Forgot password error for email ${email}:`, {
        error: getErrorMessage(error),
        stack: (error as unknown as { stack?: string })?.stack,
      });

      return {
        success: true,
        message:
          'If this email is registered, you will receive an OTP on your registered phone number',
      };
    }
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    try {
      this.logger.log(`Password reset attempt for email: ${email}`);

      const passwordReset = await this.prisma.passwordReset.findFirst({
        where: {
          email,
          otp,
          verified: false,
          expiresAt: { gte: new Date() },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              territory: true,
              passwordHash: true,
              active: true,
            },
          },
        },
      });

      if (!passwordReset) {
        this.logger.warn(
          `Password reset failed: Invalid or expired OTP for email - ${email}`
        );
        throw new ForbiddenException('Invalid or expired OTP');
      }

      const isSamePassword = await argon2.verify(
        passwordReset.user.passwordHash,
        newPassword
      );
      if (isSamePassword) {
        this.logger.warn(
          `Password reset failed: New password same as current password for email - ${email}`
        );
        throw new ForbiddenException(
          'New password must be different from current password'
        );
      }

      const newPasswordHash = await argon2.hash(newPassword);

      await this.prisma.user.update({
        where: { id: passwordReset.userId },
        data: { passwordHash: newPasswordHash },
      });

      await this.prisma.passwordReset.update({
        where: { id: passwordReset.id },
        data: { verified: true },
      });

      await this.redis.del(`rt:${passwordReset.userId}`);

      this.logger.log(`Password reset successfully for email: ${email}`);
      return { success: true, message: 'Password reset successfully' };
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Password reset error for email ${email}:`, {
        error: getErrorMessage(error),
        stack: (error as unknown as { stack?: string })?.stack,
      });
      throw new ForbiddenException(
        'Failed to reset password. Please try again.'
      );
    }
  }

  private async issueTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      territory: user.territory,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        territory: user.territory,
        active: user.active,
      },
    };

    const signAsync = async (
      j: JwtService,
      payloadOrPayloadFn: unknown,
      options?: Record<string, unknown>
    ) => {
      return (
        j as unknown as {
          signAsync: (p: unknown, o?: unknown) => Promise<string>;
        }
      ).signAsync(payloadOrPayloadFn, options);
    };

    const accessToken = await signAsync(this.jwt, payload, {
      secret: String(process.env.JWT_ACCESS_SECRET ?? ''),
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '3600s',
    });

    const refreshToken = await signAsync(
      this.jwt,
      { sub: user.id, email: user.email },
      {
        secret: String(process.env.JWT_REFRESH_SECRET ?? ''),
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
      }
    );

    return { accessToken, refreshToken };
  }

  private async storeRefresh(userId: string, refreshToken: string) {
    try {
      const hash = await argon2.hash(refreshToken);
      await this.redis.set(`rt:${userId}`, hash, 'EX', 31536000);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to store refresh token in Redis:',
        getErrorMessage(error)
      );
    }
  }
}
