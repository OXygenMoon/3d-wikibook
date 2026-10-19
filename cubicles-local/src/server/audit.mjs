import { randomUUID } from 'node:crypto';
import { auditLog } from './db/schema.mjs';
import { getDb } from './db.mjs';
import { logger } from './logger.mjs';

export async function writeAudit({ actorId = null, action, target = null, detail = null }) {
  try {
    await getDb().insert(auditLog).values({
      id: randomUUID(),
      actorId,
      action,
      target,
      detail,
      createdAt: Date.now(),
    });
  } catch (error) {
    logger.warn({ err: error, action, target }, 'failed to write audit log');
  }
}
