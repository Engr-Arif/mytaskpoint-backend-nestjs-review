import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) {
      throw new ForbiddenException('Invalid token payload');
    }



    if (payload.user) {

      if (!payload.user.active) {
        throw new ForbiddenException('Account is deactivated');
      }
      return payload.user;
    }


    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        territory: true,
        active: true,
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

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
