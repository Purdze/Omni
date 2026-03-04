export { OmniBot } from './OmniBot';
export { Addon } from './types/addon';
export type {
  AddonContext,
  AddonManifest,
  AddonLogger,
  AddonState,
  InterAddonAPI,
  EmbedFactoryAccess,
  ModuleAccessor,
} from './types/addon';
export type { OmniCommand, CommandRegistrar } from './types/command';
export type { AddonConfigAccess, OmniConfig, DatabaseConfig, DatabaseDriver } from './types/config';
export type { AddonDatabaseAccess, AnyDrizzleDb, AnyDrizzleTable } from './types/database';
export type { OmniEvents, AllEvents, EventSubscriber, EventListener } from './types/event';
export type { PermissionDefinition, PermissionAccessor } from './types/permission';

if (require.main === module) {
  const bot = new (require('./OmniBot').OmniBot)();
  bot.start().catch((err: Error) => {
    console.error('Fatal error during startup:', err);
    process.exit(1);
  });
}
