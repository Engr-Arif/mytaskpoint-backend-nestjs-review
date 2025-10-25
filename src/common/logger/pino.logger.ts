import pino from 'pino';
import pinoHttp from 'pino-http';
import { IncomingMessage } from 'http';
import { randomUUID } from 'crypto';

const level = process.env.LOG_LEVEL || 'info';

const pinoOptions = {
  level,
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
} as unknown as Parameters<typeof pino>[0];

export const logger = pino(pinoOptions);

// genReqId: prefer incoming X-Request-Id header, otherwise generate one
export const httpLogger = (pinoHttp as any)({
  logger,
  genReqId: (req: IncomingMessage) => {
    const header = (req.headers['x-request-id'] ||
      req.headers['X-Request-Id']) as string | undefined;
    return header || randomUUID();
  },
});

export default logger;
