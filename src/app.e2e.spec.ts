// Provide minimal required env vars for config validation BEFORE importing the app
process.env.ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS || 'https://app.example.com';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://localhost:5432/testdb';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'A'.repeat(32);
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'B'.repeat(32);
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'dummy';
process.env.SMS_API_KEY = process.env.SMS_API_KEY || 'dummy';
process.env.SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'SENDER';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('CORS e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Set ALLOWED_ORIGINS to a value that does NOT include the test origin
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    // Provide minimal required env vars for config validation
    process.env.DATABASE_URL =
      process.env.DATABASE_URL || 'postgresql://localhost:5432/testdb';
    process.env.JWT_ACCESS_SECRET =
      process.env.JWT_ACCESS_SECRET || 'A'.repeat(32);
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || 'B'.repeat(32);
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    process.env.GOOGLE_MAPS_API_KEY =
      process.env.GOOGLE_MAPS_API_KEY || 'dummy';
    process.env.SMS_API_KEY = process.env.SMS_API_KEY || 'dummy';
    process.env.SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'SENDER';
    process.env.NODE_ENV = 'production';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    delete process.env.ALLOWED_ORIGINS;
  });

  it('should deny unallowed origin (no Access-Control-Allow-Origin header)', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('Origin', 'http://evil.com')
      .expect(200);

    // Access-Control-Allow-Origin header should not be present for denied origins
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
