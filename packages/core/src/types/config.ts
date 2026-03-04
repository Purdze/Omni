export type DatabaseDriver = 'sqlite' | 'mysql';

export interface DatabaseConfig {
  driver: DatabaseDriver;
  /** Path to the .db file's parent directory (SQLite). Always set. */
  rootDir: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  name?: string;
}

export interface OmniConfig {
  token: string;
  clientId: string;
  devGuildId?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  db: DatabaseConfig;
}

export interface BrandingConfig {
  color: string;
  footerText: string;
}

export interface BotConfig {
  branding: BrandingConfig;
}

export interface AddonConfigAccess<T extends Record<string, unknown> = Record<string, unknown>> {
  getAll(): T;
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  reset(): void;
}

export interface NamedConfigAccess {
  get<T extends Record<string, unknown>>(name: string, defaults: T): AddonConfigAccess<T>;
}
