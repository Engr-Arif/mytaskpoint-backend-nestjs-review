import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TaskModule } from './tasks/tasks.module';
import { CallReportModule } from './call-reports/call-report.module';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './common/guards/roles.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { WorkerTasksModule } from './tasks/worker-tasks.module';
import { OtpModule } from './otp/otp.module';
import { SmsModule } from './sms/sms.module';
import { AdminTasksModule } from './tasks/admin-tasks.module';
import { LocationChangeRequestModule } from './location/location-change-request.module';
import { LocationVisitModule } from './location-visit/location-visit.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';

function createThrottlerOptions(): ThrottlerModuleOptions {
  return { ttl: 60, limit: 30 } as unknown as ThrottlerModuleOptions;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TaskModule,
    CallReportModule,
    WorkerTasksModule,
    OtpModule,
    AdminTasksModule,
    LocationChangeRequestModule,
    LocationVisitModule,
    SmsModule,
    HealthModule,
    AdminModule,
    ThrottlerModule.forRoot(createThrottlerOptions()),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
