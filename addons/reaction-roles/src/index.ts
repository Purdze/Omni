import { Addon } from '@omni/core';
import type { ButtonInteraction, GuildMember } from 'discord.js';
import { eq, and, sql } from 'drizzle-orm';

import {
  sqlitePanels, sqliteEntries,
  mysqlPanels, mysqlEntries,
  SQLITE_CREATE_PANELS, SQLITE_CREATE_ENTRIES,
  MYSQL_CREATE_PANELS, MYSQL_CREATE_ENTRIES,
} from './schema';

import {
  CONFIG_DEFAULTS, CONFIG_SEED, getConfig, getMessages, msg,
} from './utils/common';
import type { ReactionRolesTables } from './commands/reactionroles';
import * as reactionrolesCmd from './commands/reactionroles';

export default class ReactionRolesAddon extends Addon {
  private tables!: ReactionRolesTables;

  async onLoad(): Promise<void> {
    const { db, logger } = this.context;

    this.context.config.seed(CONFIG_SEED);
    const cfg = this.context.config.getAll() as Record<string, unknown>;
    for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
      if (!(key in cfg)) {
        this.context.config.set(key, value as any);
      }
    }

    const drizzleDb = db.getDb() as any;
    if (db.driver === 'mysql') {
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_PANELS));
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_ENTRIES));
    } else {
      drizzleDb.run(sql.raw(SQLITE_CREATE_PANELS));
      drizzleDb.run(sql.raw(SQLITE_CREATE_ENTRIES));
    }

    const isMysql = db.driver === 'mysql';
    this.tables = {
      panels: isMysql ? mysqlPanels : sqlitePanels,
      entries: isMysql ? mysqlEntries : sqliteEntries,
    };

    db.registerSchema(this.tables.panels);
    db.registerSchema(this.tables.entries);

    reactionrolesCmd.register(this.context, this.tables);

    logger.info('Reaction Roles addon loaded - 1 command registered');
  }

  async onEnable(): Promise<void> {
    const { events, logger } = this.context;

    events.on('interactionCreate', async (interaction: any) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith('rr_')) return;
      if (!interaction.guildId) return;
      if (!(await this.context.modules.isEnabled(interaction.guildId))) return;

      await this.handleButtonToggle(interaction as ButtonInteraction);
    });

    logger.info('Reaction Roles addon enabled');
  }

  async onDisable(): Promise<void> {
    this.context.logger.info('Reaction Roles addon disabled');
  }

  private async handleButtonToggle(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    if (parts.length < 3) return;

    const panelId = parseInt(parts[1], 10);
    const roleId = parts[2];
    if (isNaN(panelId)) return;

    const db = this.context.db.getDb() as any;
    const messages = getMessages(this.context);
    const config = getConfig(this.context);

    const panels = await db.select().from(this.tables.panels).where(eq(this.tables.panels.id, panelId));
    if (panels.length === 0) return;

    const entries = await db.select().from(this.tables.entries).where(
      and(
        eq(this.tables.entries.panelId, panelId),
        eq(this.tables.entries.roleId, roleId),
      ),
    );
    if (entries.length === 0) return;

    const member = interaction.member as GuildMember;
    const hasRole = member.roles.cache.has(roleId);

    try {
      const roleMention = `<@&${roleId}>`;
      if (hasRole) {
        await member.roles.remove(roleId);
      } else {
        await member.roles.add(roleId);
      }
      const msgKey = hasRole ? 'roleRemoved' : 'roleAdded';
      await interaction.reply({
        embeds: [this.context.embeds.success(hasRole ? 'Role Removed' : 'Role Added', msg(messages, msgKey, { role: roleMention }))],
        ephemeral: config.ephemeralFeedback,
      });
    } catch {
      await interaction.reply({
        embeds: [this.context.embeds.error('Failed', msg(messages, 'roleFailed'))],
        ephemeral: true,
      });
    }
  }
}
