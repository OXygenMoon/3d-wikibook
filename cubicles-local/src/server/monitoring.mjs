import { config } from './config.mjs';
import { logger } from './logger.mjs';

let sentry = null;

export async function initMonitoring() {
  if (!config.sentryDsn) {
    logger.info({ monitoring: 'local' }, 'error monitoring disabled: SENTRY_DSN is not set');
    return;
  }
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: config.sentryDsn,
      environment: config.production ? 'production' : 'development',
      tracesSampleRate: config.sentryTracesSampleRate,
    });
    sentry = Sentry;
    logger.info({ monitoring: 'sentry' }, 'error monitoring enabled');
  } catch (error) {
    logger.warn({ err: error }, 'failed to initialize Sentry; falling back to structured logs');
  }
}

export function captureError(error, context = {}) {
  logger.error({ err: error, ...context }, 'unhandled request error');
  if (sentry) {
    try {
      sentry.captureException(error, { extra: context });
    } catch {
      // Monitoring must never take the request path down.
    }
  }
}

export function monitoringStatus() {
  return sentry ? 'sentry' : 'structured-logs';
}
