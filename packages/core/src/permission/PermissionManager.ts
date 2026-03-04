import type { Client, GuildMember } from 'discord.js';
import { eq, and } from 'drizzle-orm';
import type { PermissionDefinition, PermissionAccessor } from '../types/permission';
import type { AddonLogger } from '../types/addon';
import type { DatabaseManager } from '../database/DatabaseManager';
import { getCoreSchema } from '../database/schema';

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

    const { db, table } = this.getPermissionsTable();
    const memberRoleIds = member.roles.cache.map((r) => r.id);

    const overrides = await db
      .select()
      .from(table)
      .where(
        and(
          eq(table.guildId, guildId),
          eq(table.permissionNode, permissionId),
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

  async grant(guildId: string, roleId: string, node: string): Promise<void> {
    await this.upsertOverride(guildId, roleId, node, true);
  }

  async deny(guildId: string, roleId: string, node: string): Promise<void> {
    await this.upsertOverride(guildId, roleId, node, false);
  }

  async reset(guildId: string, roleId: string, node: string): Promise<void> {
    const { db, table } = this.getPermissionsTable();
    await db
      .delete(table)
      .where(
        and(
          eq(table.guildId, guildId),
          eq(table.roleId, roleId),
          eq(table.permissionNode, node),
        ),
      );
  }

  async listOverrides(guildId: string, roleId?: string): Promise<Array<{ roleId: string; permissionNode: string; granted: boolean }>> {
    const { db, table } = this.getPermissionsTable();
    const conditions = [eq(table.guildId, guildId)];
    if (roleId) conditions.push(eq(table.roleId, roleId));

    return db
      .select({
        roleId: table.roleId,
        permissionNode: table.permissionNode,
        granted: table.granted,
      })
      .from(table)
      .where(and(...conditions));
  }

  removeAllForAddon(addonId: string): void {
    for (const [id] of this.definitions) {
      if (id.startsWith(`${addonId}.`)) {
        this.definitions.delete(id);
      }
    }
  }

  private async upsertOverride(guildId: string, roleId: string, node: string, granted: boolean): Promise<void> {
    await this.reset(guildId, roleId, node);
    const { db, table } = this.getPermissionsTable();
    await db.insert(table).values({ guildId, roleId, permissionNode: node, granted });
  }

  private getPermissionsTable() {
    const db = this.dbManager.getDb() as any;
    const { permissions: table } = getCoreSchema(this.dbManager.driver);
    return { db, table };
  }

  private resolveId(addonId: string, rawId: string): string {
    return rawId.includes('.') ? rawId : `${addonId}.${rawId}`;
  }
}
