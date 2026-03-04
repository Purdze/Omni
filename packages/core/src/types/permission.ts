import type { PermissionResolvable } from 'discord.js';

export interface PermissionDefinition {
  id: string;
  description: string;
  defaultDiscordPermissions?: PermissionResolvable[];
}

export interface PermissionAccessor {
  define(definition: PermissionDefinition): void;
  check(guildId: string, userId: string, permissionId: string): Promise<boolean>;
}
