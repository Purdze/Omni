import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mysqlTable, varchar, int, serial, bigint } from 'drizzle-orm/mysql-core';

export const sqliteHubs = sqliteTable('tempchannels_hubs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
});

export const sqliteActive = sqliteTable('tempchannels_active', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  ownerId: text('owner_id').notNull(),
  hubId: text('hub_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const mysqlHubs = mysqlTable('tempchannels_hubs', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  channelId: varchar('channel_id', { length: 255 }).notNull(),
});

export const mysqlActive = mysqlTable('tempchannels_active', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  channelId: varchar('channel_id', { length: 255 }).notNull(),
  ownerId: varchar('owner_id', { length: 255 }).notNull(),
  hubId: varchar('hub_id', { length: 255 }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const SQLITE_CREATE_HUBS = `
  CREATE TABLE IF NOT EXISTS tempchannels_hubs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    channel_id TEXT NOT NULL
  )
`;

export const SQLITE_CREATE_ACTIVE = `
  CREATE TABLE IF NOT EXISTS tempchannels_active (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT    NOT NULL,
    channel_id TEXT    NOT NULL,
    owner_id   TEXT    NOT NULL,
    hub_id     TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  )
`;

export const MYSQL_CREATE_HUBS = `
  CREATE TABLE IF NOT EXISTS tempchannels_hubs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    guild_id   VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL
  )
`;

export const MYSQL_CREATE_ACTIVE = `
  CREATE TABLE IF NOT EXISTS tempchannels_active (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    guild_id   VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    owner_id   VARCHAR(255) NOT NULL,
    hub_id     VARCHAR(255) NOT NULL,
    created_at BIGINT       NOT NULL
  )
`;
