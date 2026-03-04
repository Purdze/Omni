import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import type { AnyMySqlTable } from 'drizzle-orm/mysql-core';
import type { DatabaseDriver } from './config';

export type AnyDrizzleDb = BetterSQLite3Database | MySql2Database;
export type AnyDrizzleTable = AnySQLiteTable | AnyMySqlTable;

export interface AddonDatabaseAccess {
  driver: DatabaseDriver;
  registerSchema(table: AnyDrizzleTable): void;
  getDb(): AnyDrizzleDb;
}
