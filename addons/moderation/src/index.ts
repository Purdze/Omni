import { Addon } from '@omni/core';
import type { TextChannel } from 'discord.js';
import { eq, and, desc, lte, sql } from 'drizzle-orm';

import {
  sqliteActions, sqliteTempbans,
  mysqlActions, mysqlTempbans,
  SQLITE_CREATE_ACTIONS, SQLITE_CREATE_TEMPBANS,
  MYSQL_CREATE_ACTIONS, MYSQL_CREATE_TEMPBANS,
} from './schema';

import * as slowmodeCmd from './commands/slowmode';
import * as lockCmd from './commands/lock';
import * as warnCmd from './commands/warn';
import * as kickCmd from './commands/kick';
import * as banCmd from './commands/ban';
import * as muteCmd from './commands/mute';
import * as warningsCmd from './commands/warnings';
import * as historyCmd from './commands/history';
import * as modlogCmd from './commands/modlog';

declare module '@omni/core' {
  interface OmniEvents {
    'moderation:warn': [guildId: string, targetId: string, moderatorId: string, reason: string, warningCount: number];
    'moderation:kick': [guildId: string, targetId: string, moderatorId: string, reason: string];
    'moderation:ban': [guildId: string, targetId: string, moderatorId: string, reason: string];
    'moderation:tempban': [guildId: string, targetId: string, moderatorId: string, reason: string, durationMs: number];
    'moderation:unban': [guildId: string, targetId: string, moderatorId: string, reason: string];
    'moderation:mute': [guildId: string, targetId: string, moderatorId: string, reason: string, durationMs: number];
    'moderation:unmute': [guildId: string, targetId: string, moderatorId: string, reason: string];
    'moderation:clearwarnings': [guildId: string, targetId: string, moderatorId: string];
  }
}

export interface ModerationConfig {
  dmOnAction: boolean;
  defaultReason: string;
  tempbanCheckInterval: number;
  maxDeleteDays: number;
  logChannelId: string;
  warnThreshold: number;
  warnThresholdAction: 'kick' | 'ban' | 'tempban' | 'mute';
  warnThresholdDuration: string;
}

export interface ModerationTables {
  actions: any;
  tempbans: any;
}

export interface ActionInsert {
  guildId: string;
  targetId: string;
  moderatorId: string;
  action: string;
  reason?: string;
  duration?: number;
  expiresAt?: number;
  createdAt: number;
}

export type ModerationAPI = {
  getWarningCount(guildId: string, userId: string): Promise<number>;
  getHistory(guildId: string, userId: string, limit?: number): Promise<any[]>;
  addWarning(guildId: string, targetId: string, moderatorId: string, reason: string): Promise<number>;
};

const CONFIG_DEFAULTS: ModerationConfig = {
  dmOnAction: true,
  defaultReason: 'No reason provided',
  tempbanCheckInterval: 30,
  maxDeleteDays: 7,
  logChannelId: '',
  warnThreshold: 0,
  warnThresholdAction: 'mute',
  warnThresholdDuration: '1h',
};

export default class ModerationAddon extends Addon {
  private tables!: ModerationTables;
  private tempbanInterval: ReturnType<typeof setInterval> | null = null;

  async onLoad(): Promise<void> {
    const { db, logger } = this.context;

    const cfg = this.context.config.getAll() as Record<string, unknown>;
    for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
      if (!(key in cfg)) {
        this.context.config.set(key, value as any);
      }
    }

    const drizzleDb = db.getDb() as any;
    if (db.driver === 'mysql') {
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_ACTIONS));
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_TEMPBANS));
    } else {
      drizzleDb.run(sql.raw(SQLITE_CREATE_ACTIONS));
      drizzleDb.run(sql.raw(SQLITE_CREATE_TEMPBANS));
    }

    const isMysql = db.driver === 'mysql';
    this.tables = {
      actions: isMysql ? mysqlActions : sqliteActions,
      tempbans: isMysql ? mysqlTempbans : sqliteTempbans,
    };

    db.registerSchema(this.tables.actions);
    db.registerSchema(this.tables.tempbans);

    const helpers = {
      insertAction: this.insertAction.bind(this),
      sendModLog: this.sendModLog.bind(this),
      getWarningCount: this.getWarningCount.bind(this),
    };

    slowmodeCmd.register(this.context);
    lockCmd.register(this.context);
    warnCmd.register(this.context, this.tables, helpers);
    kickCmd.register(this.context, this.tables, helpers);
    banCmd.register(this.context, this.tables, helpers);
    muteCmd.register(this.context, this.tables, helpers);
    warningsCmd.register(this.context, this.tables);
    historyCmd.register(this.context, this.tables);
    modlogCmd.register(this.context, this.tables);

    logger.info('Moderation addon loaded - 14 commands registered');
  }

  async onEnable(): Promise<void> {
    const { logger, addons } = this.context;

    addons.expose<ModerationAPI>({
      getWarningCount: (guildId, userId) => this.getWarningCount(guildId, userId),
      getHistory: async (guildId, userId, limit = 25) => {
        const db = this.context.db.getDb() as any;
        return db.select().from(this.tables.actions)
          .where(and(eq(this.tables.actions.guildId, guildId), eq(this.tables.actions.targetId, userId)))
          .orderBy(desc(this.tables.actions.createdAt))
          .limit(limit);
      },
      addWarning: (guildId, targetId, moderatorId, reason) => {
        return this.insertAction({
          guildId, targetId, moderatorId,
          action: 'warn', reason, createdAt: Date.now(),
        });
      },
    });

    const config = this.context.config.getAll() as unknown as ModerationConfig;
    const intervalMs = (config.tempbanCheckInterval || 30) * 1000;

    // Run immediately to catch expirations that occurred while bot was offline
    await this.checkTempbans();

    this.tempbanInterval = setInterval(() => {
      this.checkTempbans().catch(err => {
        logger.error(`Tempban check failed: ${err}`);
      });
    }, intervalMs);

    logger.info('Moderation addon enabled');
  }

  async onDisable(): Promise<void> {
    if (this.tempbanInterval) {
      clearInterval(this.tempbanInterval);
      this.tempbanInterval = null;
    }
    this.context.logger.info('Moderation addon disabled');
  }

  private async insertAction(values: ActionInsert): Promise<number> {
    const db = this.context.db.getDb() as any;

    if (this.context.db.driver === 'mysql') {
      const result = await db.insert(this.tables.actions).values(values);
      return result[0].insertId;
    } else {
      const result = await db.insert(this.tables.actions).values(values).returning({ id: this.tables.actions.id });
      return result[0].id;
    }
  }

  private async sendModLog(
    guildId: string,
    title: string,
    fields: { name: string; value: string; inline?: boolean }[],
    color: 'warning' | 'info',
  ): Promise<void> {
    const config = this.context.config.getAll() as unknown as ModerationConfig;
    if (!config.logChannelId) return;

    try {
      const channel = await this.context.client.channels.fetch(config.logChannelId);
      if (channel && channel.isTextBased()) {
        const embed = this.context.embeds[color](title, '\u200b', { fields, footer: 'Omni Moderation' });
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } catch {
      // Channel may have been deleted or bot lacks access - non-critical
    }
  }

  getWarningCount(guildId: string, userId: string): Promise<number> {
    return this.countWarnsSinceClear(guildId, userId);
  }

  private async countWarnsSinceClear(guildId: string, userId: string): Promise<number> {
    const db = this.context.db.getDb() as any;
    const { actions } = this.tables;

    const lastClear = await db.select({ id: actions.id })
      .from(actions)
      .where(and(
        eq(actions.guildId, guildId),
        eq(actions.targetId, userId),
        eq(actions.action, 'clearwarnings'),
      ))
      .orderBy(desc(actions.createdAt))
      .limit(1);

    const sinceId = lastClear.length > 0 ? lastClear[0].id : 0;

    const warnings = await db.select({ id: actions.id })
      .from(actions)
      .where(and(
        eq(actions.guildId, guildId),
        eq(actions.targetId, userId),
        eq(actions.action, 'warn'),
      ));

    return warnings.filter((w: any) => w.id > sinceId).length;
  }

  private async checkTempbans(): Promise<void> {
    const db = this.context.db.getDb() as any;
    const { tempbans } = this.tables;
    const now = Date.now();

    const expired = await db.select().from(tempbans).where(lte(tempbans.expiresAt, now));

    for (const row of expired) {
      if (!(await this.context.modules.isEnabled(row.guildId))) continue;

      try {
        const guild = await this.context.client.guilds.fetch(row.guildId);
        await guild.members.unban(row.targetId, 'Tempban expired');

        await this.insertAction({
          guildId: row.guildId,
          targetId: row.targetId,
          moderatorId: this.context.client.user!.id,
          action: 'unban',
          reason: 'Tempban expired (auto-unban)',
          createdAt: now,
        });

        this.context.events.emit('moderation:unban', row.guildId, row.targetId, this.context.client.user!.id, 'Tempban expired');

        await this.sendModLog(row.guildId, 'Tempban Expired', [
          { name: 'User', value: `<@${row.targetId}> (${row.targetId})`, inline: true },
          { name: 'Action', value: 'Auto-unban', inline: true },
        ], 'info');
      } catch (err) {
        this.context.logger.warn(`Failed to auto-unban ${row.targetId} in ${row.guildId}: ${err}`);
      }

      // Always delete the row even if unban failed (e.g. user already unbanned manually)
      await db.delete(tempbans).where(eq(tempbans.id, row.id));
    }
  }
}
