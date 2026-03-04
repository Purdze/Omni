import type { AnyDrizzleDb, AnyDrizzleTable, AddonDatabaseAccess } from '../types/database';
import type { DatabaseDriver } from '../types/config';
import type { AddonLogger } from '../types/addon';

/**
 * Namespaces addon table names to prevent cross-addon collisions. A
 * `warnings` table registered by the `moderation` addon becomes
 * `moderation_warnings` in the database.
 */
export class AddonDatabase {
  private readonly logger: AddonLogger;

  constructor(logger: AddonLogger) {
    this.logger = logger;
  }

  createAccess(
    addonId: string,
    db: AnyDrizzleDb,
    driver: DatabaseDriver,
  ): AddonDatabaseAccess {
    const registeredTables: AnyDrizzleTable[] = [];

    const access: AddonDatabaseAccess = {
      driver,

      registerSchema: (table: AnyDrizzleTable): void => {
        const tableName = this.getTableName(table);

        if (tableName && !tableName.startsWith(`${addonId}_`)) {
          this.logger.warn(
            `Addon "${addonId}" registered table "${tableName}" which does not ` +
              `follow the naming convention "${addonId}_<table>". ` +
              `This may cause collisions with other addons.`,
          );
        }

        registeredTables.push(table);
        this.logger.debug(
          `Addon "${addonId}" registered schema for table "${tableName ?? '<unknown>'}"`,
        );
      },

      getDb: (): AnyDrizzleDb => {
        return db;
      },
    };

    return access;
  }

  /**
   * Drizzle stores table names behind Symbol-keyed properties. We try the
   * `_` metadata helper first, then fall back to searching symbol keys.
   */
  private getTableName(table: AnyDrizzleTable): string | undefined {
    const tableAny = table as unknown as Record<string, unknown>;
    const meta = tableAny['_'];
    if (meta && typeof meta === 'object' && 'name' in (meta as Record<string, unknown>)) {
      return (meta as Record<string, unknown>)['name'] as string;
    }

    const symbols = Object.getOwnPropertySymbols(table);
    for (const sym of symbols) {
      if (sym.description === 'drizzle:Name') {
        return (table as unknown as Record<symbol, unknown>)[sym] as string;
      }
    }

    return undefined;
  }
}
