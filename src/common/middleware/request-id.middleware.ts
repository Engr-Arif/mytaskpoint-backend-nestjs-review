import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logger/pino.logger';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const fromReqId = (req as any).id as string | undefined;
    const header = (req.header('x-request-id') ||
      req.header('X-Request-Id')) as string | undefined;
    const id = fromReqId || header || randomUUID();

    (req as any).requestId = id;
    res.setHeader('X-Request-Id', id);
  } catch (err) {
    logger.debug({ err }, 'requestIdMiddleware error');
  }
  return next();
}

export default requestIdMiddleware;
