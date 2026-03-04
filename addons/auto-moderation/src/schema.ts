import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mysqlTable, varchar, int, serial, bigint } from 'drizzle-orm/mysql-core';

export const sqliteViolations = sqliteTable('auto_moderation_violations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  filterType: text('filter_type').notNull(),
  details: text('details').notNull(),
  actionTaken: text('action_taken').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sqliteFilters = sqliteTable('auto_moderation_filters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  filterType: text('filter_type').notNull(),
  pattern: text('pattern').notNull(),
  enabled: integer('enabled').notNull().default(1),
});

export const mysqlViolations = mysqlTable('auto_moderation_violations', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  filterType: varchar('filter_type', { length: 50 }).notNull(),
  details: varchar('details', { length: 1000 }).notNull(),
  actionTaken: varchar('action_taken', { length: 50 }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const mysqlFilters = mysqlTable('auto_moderation_filters', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  filterType: varchar('filter_type', { length: 50 }).notNull(),
  pattern: varchar('pattern', { length: 500 }).notNull(),
  enabled: int('enabled').notNull().default(1),
});

export const SQLITE_CREATE_VIOLATIONS = `
  CREATE TABLE IF NOT EXISTS auto_moderation_violations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT    NOT NULL,
    user_id      TEXT    NOT NULL,
    filter_type  TEXT    NOT NULL,
    details      TEXT    NOT NULL,
    action_taken TEXT    NOT NULL,
    created_at   INTEGER NOT NULL
  )
`;

export const SQLITE_CREATE_FILTERS = `
  CREATE TABLE IF NOT EXISTS auto_moderation_filters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT    NOT NULL,
    filter_type TEXT    NOT NULL,
    pattern     TEXT    NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1
  )
`;

export const MYSQL_CREATE_VIOLATIONS = `
  CREATE TABLE IF NOT EXISTS auto_moderation_violations (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    guild_id     VARCHAR(255) NOT NULL,
    user_id      VARCHAR(255) NOT NULL,
    filter_type  VARCHAR(50)  NOT NULL,
    details      VARCHAR(1000) NOT NULL,
    action_taken VARCHAR(50)  NOT NULL,
    created_at   BIGINT       NOT NULL
  )
`;

export const MYSQL_CREATE_FILTERS = `
  CREATE TABLE IF NOT EXISTS auto_moderation_filters (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    guild_id    VARCHAR(255) NOT NULL,
    filter_type VARCHAR(50)  NOT NULL,
    pattern     VARCHAR(500) NOT NULL,
    enabled     INT          NOT NULL DEFAULT 1
  )
`;
