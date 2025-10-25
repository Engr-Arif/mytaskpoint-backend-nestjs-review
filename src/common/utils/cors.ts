import { Request } from 'express';

export type OriginValidator = (
  origin: string | undefined,
  req?: Request
) => boolean;

export function createOriginValidator(
  allowedOrigins: string[],
  nodeEnv = process.env.NODE_ENV
): OriginValidator {
  const allowed = allowedOrigins.map((s) => s.trim()).filter(Boolean);

  return (origin: string | undefined) => {
    if (!origin) return true;
    if (nodeEnv === 'development') return true;
    if (allowed.length === 0) return false;
    return allowed.includes(origin);
  };
}

export default createOriginValidator;
