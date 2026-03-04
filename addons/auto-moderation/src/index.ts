import { Addon } from '@omni/core';
import type { Message, GuildMember, TextChannel } from 'discord.js';
import { GuildVerificationLevel } from 'discord.js';
import { eq, sql } from 'drizzle-orm';

declare module '@omni/core' {
  interface OmniEvents {
    'moderation:warn': [guildId: string, targetId: string, moderatorId: string, reason: string, warningCount: number];
    'moderation:kick': [guildId: string, targetId: string, moderatorId: string, reason: string];
    'moderation:ban': [guildId: string, targetId: string, moderatorId: string, reason: string];
    'moderation:mute': [guildId: string, targetId: string, moderatorId: string, reason: string, durationMs: number];
  }
}

import {
  sqliteViolations, sqliteFilters,
  mysqlViolations, mysqlFilters,
  SQLITE_CREATE_VIOLATIONS, SQLITE_CREATE_FILTERS,
  MYSQL_CREATE_VIOLATIONS, MYSQL_CREATE_FILTERS,
} from './schema';

import {
  CONFIG_DEFAULTS, CONFIG_SEED, getConfig, getMessages, msg,
} from './utils/common';

import {
  checkWordFilter, checkMentionSpam, checkSpam, checkLinkFilter,
  trackJoin, clearSpamMap, clearRaidMap, pruneSpamEntries, pruneRaidEntries,
  type FilterMatch,
} from './utils/filters';

import { executeEscalation, type AutoModTables } from './utils/punishments';
import * as automodCmd from './commands/automod';

export default class AutoModerationAddon extends Addon {
  private tables!: AutoModTables;
  private pruneInterval: ReturnType<typeof setInterval> | null = null;

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
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_VIOLATIONS));
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_FILTERS));
    } else {
      drizzleDb.run(sql.raw(SQLITE_CREATE_VIOLATIONS));
      drizzleDb.run(sql.raw(SQLITE_CREATE_FILTERS));
    }

    const isMysql = db.driver === 'mysql';
    this.tables = {
      violations: isMysql ? mysqlViolations : sqliteViolations,
      filters: isMysql ? mysqlFilters : sqliteFilters,
    };

    db.registerSchema(this.tables.violations);
    db.registerSchema(this.tables.filters);

    automodCmd.register(this.context, this.tables);

    logger.info('Auto-moderation addon loaded - 2 commands registered');
  }

  async onEnable(): Promise<void> {
    const { events, logger } = this.context;

    events.on('messageCreate', async (message: Message) => {
      if (!message.guild) return;
      if (message.author.bot) return;
      if (!(await this.context.modules.isEnabled(message.guild.id))) return;

      await this.handleMessage(message);
    });

    events.on('guildMemberAdd', async (member: GuildMember) => {
      if (!(await this.context.modules.isEnabled(member.guild.id))) return;

      await this.handleMemberJoin(member);
    });

    this.pruneInterval = setInterval(() => {
      const config = getConfig(this.context);
      const now = Date.now();
      const maxWindow = Math.max(config.spamMessageWindow, config.spamDuplicateWindow);
      pruneSpamEntries(now, maxWindow);
      pruneRaidEntries(now, config.raidJoinWindow);
    }, 60_000);

    logger.info('Auto-moderation addon enabled');
  }

  async onDisable(): Promise<void> {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }
    clearSpamMap();
    clearRaidMap();
    this.context.logger.info('Auto-moderation addon disabled');
  }

  private async handleMessage(message: Message): Promise<void> {
    const config = getConfig(this.context);
    const guildId = message.guild!.id;
    const member = message.member;

    if (!member) return;

    const exemptChannels: string[] = config.exemptChannels ?? [];
    if (exemptChannels.includes(message.channel.id)) return;

    const exemptRoles: string[] = config.exemptRoles ?? [];
    if (exemptRoles.some(roleId => member.roles.cache.has(roleId))) return;

    const db = this.context.db.getDb() as any;
    const filters = await db.select().from(this.tables.filters).where(
      eq(this.tables.filters.guildId, guildId),
    );

    // First match wins - one violation per message
    const match: FilterMatch | null =
      checkWordFilter(message.content, filters, config)
      ?? checkMentionSpam(message, config)
      ?? checkSpam(message, config)
      ?? checkLinkFilter(message.content, filters, config);

    if (!match) return;

    if (match.shouldDelete) {
      try { await message.delete(); } catch {}
    }

    const messages = getMessages(this.context);
    const dmKey = match.type === 'word' ? 'wordFilterTriggered'
      : match.type === 'mention' ? 'mentionSpam'
      : match.type === 'spam' ? 'spamDetected'
      : 'linkBlocked';

    try { await message.author.send({ content: msg(messages, dmKey) }); } catch {}

    await executeEscalation(
      this.context,
      this.tables,
      guildId,
      message.author.id,
      match.type,
      match.details,
    );
  }

  private async handleMemberJoin(member: GuildMember): Promise<void> {
    const config = getConfig(this.context);
    if (!config.raidEnabled) return;
    if (!trackJoin(member.guild.id, config)) return;

    if (config.raidAction === 'lockdown') {
      try {
        await member.guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Auto-mod: Raid detected');
      } catch (err) {
        this.context.logger.warn(`Failed to set verification level: ${err}`);
      }
    }

    if (config.raidAlertChannelId) {
      const messages = getMessages(this.context);
      await this.sendRaidAlert(config.raidAlertChannelId, msg(messages, 'raidDetected', { action: config.raidAction }));
    }
  }

  private async sendRaidAlert(channelId: string, text: string): Promise<void> {
    try {
      const channel = await this.context.client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await (channel as TextChannel).send({
          embeds: [this.context.embeds.warning('Raid Alert', text)],
        });
      }
    } catch {}
  }
}
