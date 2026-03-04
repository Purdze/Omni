import type { Client, GuildMember } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { eq, and } from 'drizzle-orm';
import type { PermissionDefinition, PermissionAccessor } from '../types/permission';
import type { AddonLogger } from '../types/addon';
import type { DatabaseManager } from '../database/DatabaseManager';
import { getCoreSchema } from '../database/schema';

/**
 * Resolution order: database overrides (grant/deny per role) -> default
 * Discord permissions from the PermissionDefinition -> server owners and
 * administrators always pass.
 */
export class PermissionManager {
  private readonly client: Client;
  private readonly dbManager: DatabaseManager;
  private readonly logger: AddonLogger;
  private readonly definitions = new Map<string, PermissionDefinition>();

  constructor(client: Client, dbManager: DatabaseManager, logger: AddonLogger) {
    this.client = client;
    this.dbManager = dbManager;
    this.logger = logger;
  }

  define(definition: PermissionDefinition): void {
    if (this.definitions.has(definition.id)) {
      this.logger.warn(
        `Permission node "${definition.id}" is already defined - overwriting.`,
      );
    }
    this.definitions.set(definition.id, definition);
    this.logger.debug(`Registered permission node: ${definition.id}`);
  }

  async check(guildId: string, userId: string, permissionId: string): Promise<boolean> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return false;

    let member: GuildMember;
    try {
      member = await guild.members.fetch(userId);
    } catch {
      return false;
    }

    if (guild.ownerId === userId) return true;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    const db = this.dbManager.getDb();
    const { permissions } = getCoreSchema(this.dbManager.driver);
    const memberRoleIds = member.roles.cache.map((r) => r.id);

    const overrides = await (db as any)
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.guildId, guildId),
          eq(permissions.permissionNode, permissionId),
        ),
      );

    const applicable = overrides.filter((o: any) => memberRoleIds.includes(o.roleId));

    if (applicable.length > 0) {
      return applicable.some((o: any) => o.granted);
    }

    const definition = this.definitions.get(permissionId);
    if (!definition) {
      this.logger.warn(
        `Permission check for undefined node "${permissionId}" - denying by default.`,
      );
      return false;
    }

    if (
      !definition.defaultDiscordPermissions ||
      definition.defaultDiscordPermissions.length === 0
    ) {
      return true;
    }

    return definition.defaultDiscordPermissions.every((perm) =>
      member.permissions.has(perm),
    );
  }

  getDefinitions(): PermissionDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefinition(id: string): PermissionDefinition | undefined {
    return this.definitions.get(id);
  }

  createAccessor(addonId: string): PermissionAccessor {
    return {
      define: (definition: PermissionDefinition) => {
        const prefixed: PermissionDefinition = {
          ...definition,
          id: this.resolveId(addonId, definition.id),
        };
        this.define(prefixed);
      },
      check: (guildId: string, userId: string, permissionId: string) => {
        return this.check(guildId, userId, this.resolveId(addonId, permissionId));
      },
    };
  }

  removeAllForAddon(addonId: string): void {
    for (const [id] of this.definitions) {
      if (id.startsWith(`${addonId}.`)) {
        this.definitions.delete(id);
      }
    }
  }

  private resolveId(addonId: string, rawId: string): string {
    return rawId.includes('.') ? rawId : `${addonId}.${rawId}`;
  }
}
