import type { Client } from 'discord.js';
import type { AddonContext as IAddonContext, InterAddonAPI } from '../types/addon';
import type { AddonLogger } from '../types/addon';
import type { CommandRegistrar } from '../types/command';
import type { AddonConfigAccess } from '../types/config';
import type { AddonDatabaseAccess } from '../types/database';
import type { EventSubscriber } from '../types/event';
import type { PermissionAccessor } from '../types/permission';
import type { EmbedFactoryAccess } from '../types/addon';
import type { AddonRegistry } from './AddonRegistry';

interface AddonContextDeps {
  addonId: string;
  logger: AddonLogger;
  db: AddonDatabaseAccess;
  config: AddonConfigAccess;
  commands: CommandRegistrar;
  events: EventSubscriber;
  permissions: PermissionAccessor;
  registry: AddonRegistry;
  client: Client;
  embeds: EmbedFactoryAccess;
}

export function createAddonContext(deps: AddonContextDeps): IAddonContext {
  const interAddonAPI: InterAddonAPI = {
    expose: <T extends Record<string, unknown>>(api: T) => {
      deps.registry.exposeAPI(deps.addonId, api);
    },
    getAPI: <T>(addonId: string): T | undefined => {
      return deps.registry.getAPI<T>(addonId);
    },
    isEnabled: (addonId: string): boolean => {
      return deps.registry.isEnabled(addonId);
    },
  };

  return {
    logger: deps.logger,
    db: deps.db,
    config: deps.config,
    commands: deps.commands,
    events: deps.events,
    permissions: deps.permissions,
    addons: interAddonAPI,
    client: deps.client,
    embeds: deps.embeds,
  };
}
