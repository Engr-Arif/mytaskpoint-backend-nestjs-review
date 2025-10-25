import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisCacheService } from '../common/services/redis-cache.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [RedisCacheService],
})
export class HealthModule {}
