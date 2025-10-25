import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  REDIS_URL: Joi.string().required(),

  GOOGLE_MAPS_API_KEY: Joi.string().required(),
  SMS_API_KEY: Joi.string().required(),
  BRAND_NAME: Joi.string().default('DTM'),
  SMS_SENDER_ID: Joi.string().required(),

  ALLOWED_ORIGINS: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional().default('http://localhost:3000'),
  }),

  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  BCRYPT_ROUNDS: Joi.number().default(12),
  PASSWORD_MIN_LENGTH: Joi.number().default(8),
  OTP_LENGTH: Joi.number().default(4),
  OTP_EXPIRY_MINUTES: Joi.number().default(10),

  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(30),
  PASSWORD_RESET_RATE_LIMIT: Joi.number().default(3),
});
