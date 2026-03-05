import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mysqlTable, varchar, int, serial, bigint } from 'drizzle-orm/mysql-core';

export const sqliteLevels = sqliteTable('leveling_levels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(0),
  lastXpAt: integer('last_xp_at').notNull().default(0),
});

export const sqliteRoleRewards = sqliteTable('leveling_role_rewards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  level: integer('level').notNull(),
  roleId: text('role_id').notNull(),
});

export const mysqlLevels = mysqlTable('leveling_levels', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  xp: int('xp').notNull().default(0),
  level: int('level').notNull().default(0),
  lastXpAt: bigint('last_xp_at', { mode: 'number' }).notNull().default(0),
});

export const mysqlRoleRewards = mysqlTable('leveling_role_rewards', {
  id: serial('id').primaryKey(),
  guildId: varchar('guild_id', { length: 255 }).notNull(),
  level: int('level').notNull(),
  roleId: varchar('role_id', { length: 255 }).notNull(),
});

export const SQLITE_CREATE_LEVELS = `
  CREATE TABLE IF NOT EXISTS leveling_levels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT    NOT NULL,
    user_id    TEXT    NOT NULL,
    xp         INTEGER NOT NULL DEFAULT 0,
    level      INTEGER NOT NULL DEFAULT 0,
    last_xp_at INTEGER NOT NULL DEFAULT 0
  )
`;

export const SQLITE_CREATE_ROLE_REWARDS = `
  CREATE TABLE IF NOT EXISTS leveling_role_rewards (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT    NOT NULL,
    level    INTEGER NOT NULL,
    role_id  TEXT    NOT NULL
  )
`;

export const MYSQL_CREATE_LEVELS = `
  CREATE TABLE IF NOT EXISTS leveling_levels (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    guild_id   VARCHAR(255) NOT NULL,
    user_id    VARCHAR(255) NOT NULL,
    xp         INT          NOT NULL DEFAULT 0,
    level      INT          NOT NULL DEFAULT 0,
    last_xp_at BIGINT       NOT NULL DEFAULT 0
  )
`;

export const MYSQL_CREATE_ROLE_REWARDS = `
  CREATE TABLE IF NOT EXISTS leveling_role_rewards (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    level    INT          NOT NULL,
    role_id  VARCHAR(255) NOT NULL
  )
`;
