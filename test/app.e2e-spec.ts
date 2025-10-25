import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('CORS e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';

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

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
