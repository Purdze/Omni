import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mysqlTable, varchar, int, serial, bigint } from 'drizzle-orm/mysql-core';

export const sqliteActions = sqliteTable('moderation_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  targetId: text('target_id').notNull(),
  moderatorId: text('moderator_id').notNull(),
  action: text('action').notNull(),
  reason: text('reason'),
  duration: integer('duration'),
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull(),
});

export const sqliteTempbans = sqliteTable('moderation_tempbans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  targetId: text('target_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
  actionId: integer('action_id').notNull(),
});

export const mysqlActions = mysqlTable('moderation_actions', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  targetId: varchar('target_id', { length: 255 }).notNull(),
  moderatorId: varchar('moderator_id', { length: 255 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  reason: varchar('reason', { length: 1024 }),
  duration: bigint('duration', { mode: 'number' }),
  expiresAt: bigint('expires_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const mysqlTempbans = mysqlTable('moderation_tempbans', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  targetId: varchar('target_id', { length: 255 }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  actionId: int('action_id').notNull(),
});

export const SQLITE_CREATE_ACTIONS = `
  CREATE TABLE IF NOT EXISTS moderation_actions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT    NOT NULL,
    target_id     TEXT    NOT NULL,
    moderator_id  TEXT    NOT NULL,
    action        TEXT    NOT NULL,
    reason        TEXT,
    duration      INTEGER,
    expires_at    INTEGER,
    created_at    INTEGER NOT NULL
  )
`;

export const SQLITE_CREATE_TEMPBANS = `
  CREATE TABLE IF NOT EXISTS moderation_tempbans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT    NOT NULL,
    target_id   TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    action_id   INTEGER NOT NULL
  )
`;

export const MYSQL_CREATE_ACTIONS = `
  CREATE TABLE IF NOT EXISTS moderation_actions (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    guild_id      VARCHAR(255) NOT NULL,
    target_id     VARCHAR(255) NOT NULL,
    moderator_id  VARCHAR(255) NOT NULL,
    action        VARCHAR(50)  NOT NULL,
    reason        VARCHAR(1024),
    duration      BIGINT,
    expires_at    BIGINT,
    created_at    BIGINT NOT NULL
  )
`;

export const MYSQL_CREATE_TEMPBANS = `
  CREATE TABLE IF NOT EXISTS moderation_tempbans (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    guild_id    VARCHAR(255) NOT NULL,
    target_id   VARCHAR(255) NOT NULL,
    expires_at  BIGINT NOT NULL,
    action_id   INT NOT NULL
  )
`;
