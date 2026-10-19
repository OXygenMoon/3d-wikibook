import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * P0 keeps the existing community document intact inside PostgreSQL.
 * Identity, sessions, messages and audit records are already first-class rows.
 * P1 can normalize users/zones/learning domains table by table without changing
 * the HTTP contract.
 */
export const communityState = pgTable('community_state', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
  revision: bigint('revision', { mode: 'number' }).notNull().default(1),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  seen: bigint('seen', { mode: 'number' }).notNull(),
  x: doublePrecision('x').notNull(),
  z: doublePrecision('z').notNull(),
  rotation: doublePrecision('rotation').notNull().default(0),
  avatar: text('avatar').notNull().default('classic'),
  color: text('color').notNull().default('#a6b79a'),
  dancing: boolean('dancing').notNull().default(false),
  lastMessage: bigint('last_message', { mode: 'number' }),
  lastSticker: bigint('last_sticker', { mode: 'number' }),
  fishingAt: bigint('fishing_at', { mode: 'number' }),
});

export const messages = pgTable('messages', {
  seq: serial('seq').primaryKey(),
  id: uuid('id').notNull(),
  name: text('name').notNull(),
  text: text('text').notNull(),
  time: bigint('time', { mode: 'number' }).notNull(),
  playerId: text('player_id'),
  system: boolean('system').notNull().default(false),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
