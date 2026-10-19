import { randomUUID } from 'node:crypto';
import { desc, sql } from 'drizzle-orm';
import { messages as messagesTable } from './db/schema.mjs';
import { getDb } from './db.mjs';
import { seedMessages } from '../data.js';
import { logger } from './logger.mjs';

export let messages = [];

function toMessage(row) {
  return {
    id: row.id,
    name: row.name,
    text: row.text,
    time: Number(row.time),
    ...(row.playerId ? { playerId: row.playerId } : {}),
    ...(row.system ? { system: true } : {}),
  };
}

export async function loadMessages() {
  const rows = await getDb().select().from(messagesTable).orderBy(desc(messagesTable.seq)).limit(100);
  messages = rows.reverse().map(toMessage);
  if (!messages.length) {
    for (const message of seedMessages) {
      await addMessage({ ...message, id: randomUUID() });
    }
  }
  logger.info({ count: messages.length }, 'messages loaded');
}

export async function addMessage(message) {
  const row = {
    id: message.id,
    name: message.name,
    text: message.text,
    time: message.time,
    playerId: message.playerId || null,
    system: Boolean(message.system),
  };
  await getDb().insert(messagesTable).values(row);
  messages.push({ ...message, ...(row.playerId ? { playerId: row.playerId } : {}), ...(row.system ? { system: true } : {}) });
  messages = messages.slice(-100);
  await getDb().execute(sql`DELETE FROM messages WHERE seq <= (SELECT COALESCE(MAX(seq), 0) - 100 FROM messages)`);
  return messages.at(-1);
}

export function recentMessages(limit = 50) {
  return messages.slice(-limit);
}
