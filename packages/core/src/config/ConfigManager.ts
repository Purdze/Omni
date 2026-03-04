import * as dotenv from 'dotenv';
import * as path from 'path';
import type { OmniConfig, DatabaseConfig, DatabaseDriver } from '../types/config';

export class ConfigManager {
  private config: OmniConfig | null = null;

  load(rootDir: string = process.cwd()): OmniConfig {
    dotenv.config({ path: path.resolve(rootDir, '.env') });

    const token = process.env.OMNI_TOKEN ?? process.env.DISCORD_TOKEN;
    const clientId = process.env.OMNI_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID;
    const devGuildId = process.env.OMNI_DEV_GUILD_ID;
    const logLevel = this.parseLogLevel(process.env.OMNI_LOG_LEVEL);

    const missing: string[] = [];
    if (!token) missing.push('OMNI_TOKEN (or DISCORD_TOKEN)');
    if (!clientId) missing.push('OMNI_CLIENT_ID (or DISCORD_CLIENT_ID)');

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables:\n${missing.map((v) => `  - ${v}`).join('\n')}\n\n` +
          'Create a .env file in the project root or set them in your shell.',
      );
    }

    this.config = {
      token: token!,
      clientId: clientId!,
      devGuildId,
      logLevel,
      db: this.parseDatabaseConfig(rootDir),
    };

    return this.config;
  }

  getConfig(): OmniConfig {
    if (!this.config) {
      throw new Error('ConfigManager.load() must be called before getConfig().');
    }
    return this.config;
  }

  private parseDatabaseConfig(rootDir: string): DatabaseConfig {
    const raw = process.env.OMNI_DB_DRIVER?.toLowerCase().trim();
    const driver: DatabaseDriver = raw === 'mysql' ? 'mysql' : 'sqlite';

    return {
      driver,
      rootDir,
      host: process.env.OMNI_DB_HOST || 'localhost',
      port: parseInt(process.env.OMNI_DB_PORT || '3306', 10),
      user: process.env.OMNI_DB_USER || 'omni',
      password: process.env.OMNI_DB_PASSWORD || '',
      name: process.env.OMNI_DB_NAME || 'omni',
    };
  }

  private parseLogLevel(raw: string | undefined): OmniConfig['logLevel'] {
    const valid: OmniConfig['logLevel'][] = ['debug', 'info', 'warn', 'error'];
    const normalised = raw?.toLowerCase().trim() as OmniConfig['logLevel'] | undefined;

    if (normalised && valid.includes(normalised)) {
      return normalised;
    }

    return 'info';
  }
}
