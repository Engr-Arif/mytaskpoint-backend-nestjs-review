import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import PinoNestLogger from './common/logger/pino-nest-logger';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import requestIdMiddleware from './common/middleware/request-id.middleware';
import { httpLogger } from './common/logger/pino.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(new PinoNestLogger());

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  if (process.env.NODE_ENV !== 'development') {
    const allowedEnv = (process.env.ALLOWED_ORIGINS || '').trim();
    if (!allowedEnv) {
      throw new Error(
        'ALLOWED_ORIGINS must be set in non-development environments'
      );
    }
  }

  app.use(httpLogger);
  app.use(requestIdMiddleware);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const createOriginValidator = (await import('./common/utils/cors.js'))
    .createOriginValidator;
  const originValidator = createOriginValidator(
    allowedOrigins,
    process.env.NODE_ENV
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      try {
        const allowed = originValidator(origin);
        return allowed
          ? callback(null, true)
          : callback(new Error('CORS origin denied'), false);
      } catch (err) {
        return callback(new Error('CORS origin denied'), false);
      }
    },
    credentials: process.env.NODE_ENV !== 'development',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const RATE_LIMIT_WINDOW_MS =
    Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
  const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 50;

  app.use(
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    })
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(` Server running on port ${port}`, 'Bootstrap');
}
bootstrap();
