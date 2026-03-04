import { mysqlTable, varchar, serial, boolean } from 'drizzle-orm/mysql-core';

export const addonRegistry = mysqlTable('addon_registry', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  version: varchar('version', { length: 255 }).notNull(),
  state: varchar('state', { length: 50 }).notNull(),
  loadedAt: varchar('loaded_at', { length: 255 }).notNull(),
});

export const permissions = mysqlTable('permissions', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  roleId: varchar('role_id', { length: 255 }).notNull(),
  permissionNode: varchar('permission_node', { length: 255 }).notNull(),
  granted: boolean('granted').notNull(),
});

export const disabledModules = mysqlTable('disabled_modules', {
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  addonId: varchar('addon_id', { length: 255 }).notNull(),
});
