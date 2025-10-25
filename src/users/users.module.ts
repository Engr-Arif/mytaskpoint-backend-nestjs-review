import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheService } from '../common/services/cache.service';
import { RedisCacheService } from '../common/services/redis-cache.service';

@Module({
  imports: [PrismaModule],
  providers: [UsersService, CacheService, RedisCacheService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
