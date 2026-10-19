import pino from 'pino';
import { config } from './config.mjs';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'cubicles', env: config.production ? 'production' : 'development' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['password', '*.password', 'passwordHash', '*.passwordHash', 'req.headers.cookie', 'headers.cookie'],
    censor: '[redacted]',
  },
});

export function requestLogger(requestId, fields = {}) {
  return logger.child({ requestId, ...fields });
}
