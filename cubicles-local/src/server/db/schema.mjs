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
  unique,
} from 'drizzle-orm/pg-core';

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

export const zones = pgTable('zones', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  role: text('role').notNull(),
  classId: integer('class_id').notNull().references(() => zones.id),
  officeId: integer('office_id').notNull().unique(),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
});

export const modelAssets = pgTable('model_assets', {
  id: uuid('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id),
  visibility: text('visibility').notNull(),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
});

export const worldBuildings = pgTable('world_buildings', {
  id: text('id').primaryKey(),
  assetId: uuid('asset_id').references(() => modelAssets.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
});

export const officeLayouts = pgTable('office_layouts', {
  id: integer('id').primaryKey(),
  zoneId: integer('zone_id').notNull().references(() => zones.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
});

export const classTasks = pgTable('class_tasks', {
  id: uuid('id').primaryKey(),
  classId: integer('class_id').notNull().references(() => zones.id),
  authorId: text('author_id').notNull().references(() => users.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
});

export const classSubmissions = pgTable('class_submissions', {
  id: uuid('id').primaryKey(),
  taskId: uuid('task_id').notNull().references(() => classTasks.id),
  userId: text('user_id').notNull().references(() => users.id),
  classId: integer('class_id').notNull().references(() => zones.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
}, table => [unique('class_submissions_task_user_unique').on(table.taskId, table.userId)]);

export const classAnnouncements = pgTable('class_announcements', {
  id: uuid('id').primaryKey(),
  classId: integer('class_id').notNull().references(() => zones.id),
  authorId: text('author_id').notNull().references(() => users.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
});

export const rewardGrants = pgTable('reward_grants', {
  id: text('id').primaryKey(),
  taskId: uuid('task_id').notNull().references(() => classTasks.id),
  userId: text('user_id').notNull().references(() => users.id),
  submissionId: uuid('submission_id').notNull().references(() => classSubmissions.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
}, table => [unique('reward_grants_task_user_unique').on(table.taskId, table.userId)]);

export const sourceClasses = pgTable('source_classes', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  namespace: text('namespace').notNull(),
  subject: text('subject').notNull(),
  zoneId: integer('zone_id').notNull().references(() => zones.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
}, table => [unique('source_classes_subject_unique').on(table.provider, table.namespace, table.subject), unique('source_classes_zone_unique').on(table.provider, table.namespace, table.zoneId)]);

export const sourceIdentities = pgTable('source_identities', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  namespace: text('namespace').notNull(),
  subject: text('subject').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
}, table => [unique('source_identities_subject_unique').on(table.provider, table.namespace, table.subject), unique('source_identities_user_unique').on(table.provider, table.namespace, table.userId)]);

export const sourceGroups = pgTable('source_groups', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  namespace: text('namespace').notNull(),
  subject: text('subject').notNull(),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
}, table => [unique('source_groups_subject_unique').on(table.provider, table.namespace, table.subject)]);

export const sourceMemberships = pgTable('source_memberships', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => sourceGroups.id),
  userId: text('user_id').notNull().references(() => users.id),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
}, table => [unique('source_memberships_group_user_unique').on(table.groupId, table.userId)]);
