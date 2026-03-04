import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mysqlTable, varchar, int, serial, bigint } from 'drizzle-orm/mysql-core';

export const sqliteGiveaways = sqliteTable('giveaways_giveaways', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  messageId: text('message_id').notNull(),
  hostId: text('host_id').notNull(),
  prize: text('prize').notNull(),
  winnerCount: integer('winner_count').notNull(),
  requiredRoleId: text('required_role_id'),
  minAccountAge: integer('min_account_age'),
  endsAt: integer('ends_at').notNull(),
  ended: integer('ended').notNull().default(0),
});

export const sqliteEntries = sqliteTable('giveaways_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  giveawayId: integer('giveaway_id').notNull(),
  userId: text('user_id').notNull(),
});

export const mysqlGiveaways = mysqlTable('giveaways_giveaways', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  channelId: varchar('channel_id', { length: 255 }).notNull(),
  messageId: varchar('message_id', { length: 255 }).notNull(),
  hostId: varchar('host_id', { length: 255 }).notNull(),
  prize: varchar('prize', { length: 1024 }).notNull(),
  winnerCount: int('winner_count').notNull(),
  requiredRoleId: varchar('required_role_id', { length: 255 }),
  minAccountAge: int('min_account_age'),
  endsAt: bigint('ends_at', { mode: 'number' }).notNull(),
  ended: int('ended').notNull().default(0),
});

export const mysqlEntries = mysqlTable('giveaways_entries', {
  id: serial('id').primaryKey(),
  giveawayId: int('giveaway_id').notNull(),
  userId: varchar('user_id', { length: 255 }).notNull(),
});

export const SQLITE_CREATE_GIVEAWAYS = `
  CREATE TABLE IF NOT EXISTS giveaways_giveaways (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT    NOT NULL,
    channel_id       TEXT    NOT NULL,
    message_id       TEXT    NOT NULL,
    host_id          TEXT    NOT NULL,
    prize            TEXT    NOT NULL,
    winner_count     INTEGER NOT NULL,
    required_role_id TEXT,
    min_account_age  INTEGER,
    ends_at          INTEGER NOT NULL,
    ended            INTEGER NOT NULL DEFAULT 0
  )
`;

export const SQLITE_CREATE_ENTRIES = `
  CREATE TABLE IF NOT EXISTS giveaways_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id  INTEGER NOT NULL,
    user_id      TEXT    NOT NULL
  )
`;

export const MYSQL_CREATE_GIVEAWAYS = `
  CREATE TABLE IF NOT EXISTS giveaways_giveaways (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    guild_id         VARCHAR(255)  NOT NULL,
    channel_id       VARCHAR(255)  NOT NULL,
    message_id       VARCHAR(255)  NOT NULL,
    host_id          VARCHAR(255)  NOT NULL,
    prize            VARCHAR(1024) NOT NULL,
    winner_count     INT           NOT NULL,
    required_role_id VARCHAR(255),
    min_account_age  INT,
    ends_at          BIGINT        NOT NULL,
    ended            INT           NOT NULL DEFAULT 0
  )
`;

export const MYSQL_CREATE_ENTRIES = `
  CREATE TABLE IF NOT EXISTS giveaways_entries (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    giveaway_id  INT          NOT NULL,
    user_id      VARCHAR(255) NOT NULL
  )
`;
