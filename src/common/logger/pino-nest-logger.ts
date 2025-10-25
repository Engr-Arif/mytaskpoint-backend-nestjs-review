import { LoggerService } from '@nestjs/common';
import logger from './pino.logger';

export class PinoNestLogger implements LoggerService {
  log(message: any, context?: string) {
    logger.info({ context }, message);
  }

  error(message: any, trace?: string, context?: string) {
    logger.error({ context, trace }, message);
  }

  warn(message: any, context?: string) {
    logger.warn({ context }, message);
  }

  debug?(message: any, context?: string) {
    logger.debug({ context }, message);
  }

  verbose?(message: any, context?: string) {
    logger.info({ context, verbose: true }, message);
  }
}

export default PinoNestLogger;
