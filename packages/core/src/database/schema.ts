import type { DatabaseDriver } from '../types/config';
import * as sqliteSchema from './schema.sqlite';
import * as mysqlSchema from './schema.mysql';

export { ADDON_STATES } from './schema.sqlite';

export function getCoreSchema(driver: DatabaseDriver) {
  if (driver === 'mysql') {
    return {
      addonRegistry: mysqlSchema.addonRegistry,
      permissions: mysqlSchema.permissions,
      disabledModules: mysqlSchema.disabledModules,
    };
  }
  return {
    addonRegistry: sqliteSchema.addonRegistry,
    permissions: sqliteSchema.permissions,
    disabledModules: sqliteSchema.disabledModules,
  };
}
