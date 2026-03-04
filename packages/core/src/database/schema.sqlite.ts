import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const ADDON_STATES = ['DISCOVERED', 'COMPILED', 'LOADED', 'ENABLED', 'DISABLED', 'FAILED'] as const;

export const addonRegistry = sqliteTable('addon_registry', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  version: text('version').notNull(),
  state: text('state', { enum: [...ADDON_STATES] }).notNull(),
  loadedAt: text('loaded_at').notNull(),
});

export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  roleId: text('role_id').notNull(),
  permissionNode: text('permission_node').notNull(),
  granted: integer('granted', { mode: 'boolean' }).notNull(),
});
