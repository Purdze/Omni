import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import type { AddonLogger } from '../types/addon';
import type { DatabaseConfig, DatabaseDriver } from '../types/config';
import type { AnyDrizzleDb } from '../types/database';

export class DatabaseManager {
  private sqlite: Database.Database | null = null;
  private mysqlPool: any = null;
  private db: AnyDrizzleDb | null = null;
  private readonly config: DatabaseConfig;
  private readonly logger: AddonLogger;

  constructor(config: DatabaseConfig, logger: AddonLogger) {
    this.config = config;
    this.logger = logger;
  }

  get driver(): DatabaseDriver {
    return this.config.driver;
  }

  async connect(): Promise<void> {
    if (this.config.driver === 'mysql') {
      await this.connectMySQL();
    } else {
      this.connectSQLite();
    }

    await this.createCoreTables();
  }

  getDb(): AnyDrizzleDb {
    if (!this.db) {
      throw new Error('DatabaseManager.connect() must be called before getDb().');
    }
    return this.db;
  }

  getRawSqlite(): Database.Database {
    if (!this.sqlite) {
      throw new Error('Not using SQLite or not connected.');
    }
    return this.sqlite;
  }

  async close(): Promise<void> {
    if (this.sqlite) {
      this.logger.info('Closing SQLite connection');
      this.sqlite.close();
      this.sqlite = null;
    }

    if (this.mysqlPool) {
      this.logger.info('Closing MySQL connection pool');
      await this.mysqlPool.end();
      this.mysqlPool = null;
    }

    this.db = null;
  }

  private connectSQLite(): void {
    const dbPath = path.resolve(this.config.rootDir, 'data', 'omni.db');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.logger.info(`Opening SQLite database at ${dbPath}`);

    this.sqlite = new Database(dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');

    this.db = drizzleSqlite(this.sqlite);
    this.logger.info('SQLite connected (WAL mode enabled)');
  }

  private async connectMySQL(): Promise<void> {
    let mysql2: any;
    try {
      mysql2 = require('mysql2/promise');
    } catch {
      throw new Error(
        'MySQL driver selected but "mysql2" package is not installed.\n' +
          'Install it with: pnpm add mysql2\n' +
          'Or switch to SQLite by setting OMNI_DB_DRIVER=sqlite in your .env file.',
      );
    }

    const { host = 'localhost', port = 3306, user = 'omni', password = '', name = 'omni' } = this.config;

    this.logger.info(`Connecting to MySQL at ${host}:${port}/${name}`);

    this.mysqlPool = await mysql2.createPool({
      host,
      port,
      user,
      password,
      database: name,
      waitForConnections: true,
      connectionLimit: 10,
    });

    const conn = await this.mysqlPool.getConnection();
    conn.release();

    const { drizzle: drizzleMysql } = require('drizzle-orm/mysql2') as typeof import('drizzle-orm/mysql2');
    this.db = drizzleMysql(this.mysqlPool);

    this.logger.info('MySQL connected');
  }

  private async createCoreTables(): Promise<void> {
    if (this.config.driver === 'mysql') {
      await this.createCoreTablesMySQL();
    } else {
      this.createCoreTablesSQLite();
    }
    this.logger.debug('Core tables ensured');
  }

  private createCoreTablesSQLite(): void {
    if (!this.sqlite) return;

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS addon_registry (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        version     TEXT    NOT NULL,
        state       TEXT    NOT NULL CHECK(state IN ('DISCOVERED','COMPILED','LOADED','ENABLED','DISABLED','FAILED')),
        loaded_at   TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id        TEXT    NOT NULL,
        role_id         TEXT    NOT NULL,
        permission_node TEXT    NOT NULL,
        granted         INTEGER NOT NULL CHECK(granted IN (0, 1))
      );
    `);
  }

  private async createCoreTablesMySQL(): Promise<void> {
    if (!this.mysqlPool) return;

    await this.mysqlPool.execute(`
      CREATE TABLE IF NOT EXISTS addon_registry (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(255) NOT NULL UNIQUE,
        version     VARCHAR(255) NOT NULL,
        state       VARCHAR(50)  NOT NULL,
        loaded_at   VARCHAR(255) NOT NULL
      )
    `);

    await this.mysqlPool.execute(`
      CREATE TABLE IF NOT EXISTS permissions (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        guild_id        VARCHAR(255) NOT NULL,
        role_id         VARCHAR(255) NOT NULL,
        permission_node VARCHAR(255) NOT NULL,
        granted         BOOLEAN      NOT NULL
      )
    `);
  }
}
