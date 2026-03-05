import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mysqlTable, varchar, int, serial } from 'drizzle-orm/mysql-core';

export const sqlitePanels = sqliteTable('reaction_roles_panels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  messageId: text('message_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
});

export const sqliteEntries = sqliteTable('reaction_roles_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  panelId: integer('panel_id').notNull(),
  roleId: text('role_id').notNull(),
  label: text('label').notNull(),
  emoji: text('emoji').notNull().default(''),
  style: text('style').notNull().default('Primary'),
});

export const mysqlPanels = mysqlTable('reaction_roles_panels', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  channelId: varchar('channel_id', { length: 255 }).notNull(),
  messageId: varchar('message_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: varchar('description', { length: 2000 }).notNull().default(''),
});

export const mysqlEntries = mysqlTable('reaction_roles_entries', {
  id: serial('id').primaryKey(),
  panelId: int('panel_id').notNull(),
  roleId: varchar('role_id', { length: 255 }).notNull(),
  label: varchar('label', { length: 80 }).notNull(),
  emoji: varchar('emoji', { length: 255 }).notNull().default(''),
  style: varchar('style', { length: 20 }).notNull().default('Primary'),
});

export const SQLITE_CREATE_PANELS = `
  CREATE TABLE IF NOT EXISTS reaction_roles_panels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT    NOT NULL,
    channel_id  TEXT    NOT NULL,
    message_id  TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT ''
  )
`;

export const SQLITE_CREATE_ENTRIES = `
  CREATE TABLE IF NOT EXISTS reaction_roles_entries (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL,
    role_id  TEXT    NOT NULL,
    label    TEXT    NOT NULL,
    emoji    TEXT    NOT NULL DEFAULT '',
    style    TEXT    NOT NULL DEFAULT 'Primary'
  )
`;

export const MYSQL_CREATE_PANELS = `
  CREATE TABLE IF NOT EXISTS reaction_roles_panels (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    guild_id    VARCHAR(255)  NOT NULL,
    channel_id  VARCHAR(255)  NOT NULL,
    message_id  VARCHAR(255)  NOT NULL,
    title       VARCHAR(255)  NOT NULL,
    description VARCHAR(2000) NOT NULL DEFAULT ''
  )
`;

export const MYSQL_CREATE_ENTRIES = `
  CREATE TABLE IF NOT EXISTS reaction_roles_entries (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    panel_id INT          NOT NULL,
    role_id  VARCHAR(255) NOT NULL,
    label    VARCHAR(80)  NOT NULL,
    emoji    VARCHAR(255) NOT NULL DEFAULT '',
    style    VARCHAR(20)  NOT NULL DEFAULT 'Primary'
  )
`;
