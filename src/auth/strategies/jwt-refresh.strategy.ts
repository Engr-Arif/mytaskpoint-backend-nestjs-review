import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh'
) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: (req: Request) => {
        const b = req.body as unknown;
        if (b && typeof b === 'object') {
          const value = (b as Record<string, unknown>)['refreshToken'];
          return typeof value === 'string' ? value : undefined;
        }
        return undefined;
      },
      secretOrKey: process.env.JWT_REFRESH_SECRET,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    if (!payload?.sub || !payload?.email) {
      throw new ForbiddenException('Invalid refresh token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) throw new ForbiddenException('User not found');

    if (!user.active) {
      throw new ForbiddenException('Account is deactivated');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      territory: user.territory ?? null,
    };
  }
}
