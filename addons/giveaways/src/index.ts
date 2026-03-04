import { Addon } from '@omni/core';
import type { TextChannel, ButtonInteraction, GuildMember } from 'discord.js';
import { eq, and, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import {
  sqliteGiveaways, sqliteEntries,
  mysqlGiveaways, mysqlEntries,
  SQLITE_CREATE_GIVEAWAYS, SQLITE_CREATE_ENTRIES,
  MYSQL_CREATE_GIVEAWAYS, MYSQL_CREATE_ENTRIES,
} from './schema';

import {
  CONFIG_DEFAULTS, CONFIG_SEED, getConfig, getMessages, msg,
  pickRandomWinners, formatWinners, buildEndedEmbed, editGiveawayMessage, dmWinners,
} from './utils/common';
import * as giveawayCmd from './commands/giveaway';

export interface GiveawayTables {
  giveaways: any;
  entries: any;
}

export type BuildEmbedFn = (opts: {
  prize: string;
  hostId: string;
  entries: number;
  winnerCount: number;
  endsAt: number;
  requiredRoleId: string | null;
  minAccountAge: number | null;
}) => any;

export default class GiveawaysAddon extends Addon {
  private tables!: GiveawayTables;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

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
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_GIVEAWAYS));
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_ENTRIES));
    } else {
      drizzleDb.run(sql.raw(SQLITE_CREATE_GIVEAWAYS));
      drizzleDb.run(sql.raw(SQLITE_CREATE_ENTRIES));
    }

    const isMysql = db.driver === 'mysql';
    this.tables = {
      giveaways: isMysql ? mysqlGiveaways : sqliteGiveaways,
      entries: isMysql ? mysqlEntries : sqliteEntries,
    };

    db.registerSchema(this.tables.giveaways);
    db.registerSchema(this.tables.entries);

    giveawayCmd.register(this.context, this.tables, this.buildGiveawayEmbed.bind(this));

    logger.info('Giveaways addon loaded - 1 command registered');
  }

  async onEnable(): Promise<void> {
    const { events, logger } = this.context;

    events.on('interactionCreate', async (interaction: any) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith('giveaway_enter_')) return;
      if (!interaction.guildId) return;
      if (!(await this.context.modules.isEnabled(interaction.guildId))) return;

      await this.handleButtonEntry(interaction as ButtonInteraction);
    });

    await this.checkExpiredGiveaways();

    const config = getConfig(this.context);
    const intervalMs = (config.checkInterval || 15) * 1000;

    this.checkInterval = setInterval(() => {
      this.checkExpiredGiveaways().catch(err => {
        logger.error(`Giveaway check failed: ${err}`);
      });
    }, intervalMs);

    logger.info('Giveaways addon enabled');
  }

  async onDisable(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.context.logger.info('Giveaways addon disabled');
  }

  private buildGiveawayEmbed(opts: {
    prize: string;
    hostId: string;
    entries: number;
    winnerCount: number;
    endsAt: number;
    requiredRoleId: string | null;
    minAccountAge: number | null;
  }): any {
    const messages = getMessages(this.context);
    const endsAtUnix = String(Math.floor(opts.endsAt / 1000));

    let description = msg(messages, 'giveawayDescription', {
      prize: opts.prize,
      host: `<@${opts.hostId}>`,
      entries: String(opts.entries),
      winnerCount: String(opts.winnerCount),
      endsAtUnix,
    });

    if (opts.requiredRoleId) {
      description += `\nRequired role: <@&${opts.requiredRoleId}>`;
    }
    if (opts.minAccountAge) {
      description += `\nMin account age: **${opts.minAccountAge} days**`;
    }

    return this.context.embeds.info(
      msg(messages, 'giveawayTitle'),
      description,
    );
  }

  private async handleButtonEntry(interaction: ButtonInteraction): Promise<void> {
    const giveawayId = parseInt(interaction.customId.replace('giveaway_enter_', ''), 10);
    if (isNaN(giveawayId)) return;

    const db = this.context.db.getDb() as any;
    const messages = getMessages(this.context);

    const rows = await db.select().from(this.tables.giveaways).where(eq(this.tables.giveaways.id, giveawayId));
    if (rows.length === 0) return;

    const giveaway = rows[0];
    if (giveaway.ended) return;

    const member = interaction.member as GuildMember;

    if (giveaway.requiredRoleId && !member.roles.cache.has(giveaway.requiredRoleId)) {
      await interaction.reply({
        embeds: [this.context.embeds.error('Cannot Enter', msg(messages, 'requirementNotMet'))],
        ephemeral: true,
      });
      return;
    }

    if (giveaway.minAccountAge) {
      const accountAgeDays = (Date.now() - interaction.user.createdTimestamp) / 86_400_000;
      if (accountAgeDays < giveaway.minAccountAge) {
        await interaction.reply({
          embeds: [this.context.embeds.error('Cannot Enter', msg(messages, 'requirementNotMet'))],
          ephemeral: true,
        });
        return;
      }
    }

    const existing = await db.select().from(this.tables.entries).where(
      and(
        eq(this.tables.entries.giveawayId, giveawayId),
        eq(this.tables.entries.userId, interaction.user.id),
      ),
    );

    if (existing.length > 0) {
      await interaction.reply({
        embeds: [this.context.embeds.error('Already Entered', msg(messages, 'alreadyEntered'))],
        ephemeral: true,
      });
      return;
    }

    await db.insert(this.tables.entries).values({
      giveawayId,
      userId: interaction.user.id,
    });

    const allEntries = await db.select().from(this.tables.entries).where(eq(this.tables.entries.giveawayId, giveawayId));

    try {
      const channel = await this.context.client.channels.fetch(giveaway.channelId) as TextChannel;
      const message = await channel.messages.fetch(giveaway.messageId);
      const updatedEmbed = this.buildGiveawayEmbed({
        prize: giveaway.prize,
        hostId: giveaway.hostId,
        entries: allEntries.length,
        winnerCount: giveaway.winnerCount,
        endsAt: giveaway.endsAt,
        requiredRoleId: giveaway.requiredRoleId,
        minAccountAge: giveaway.minAccountAge,
      });
      await message.edit({ embeds: [updatedEmbed] });
    } catch {
      // Non-critical
    }

    await interaction.reply({
      embeds: [this.context.embeds.success('Entered!', msg(messages, 'entryConfirmed', { prize: giveaway.prize }))],
      ephemeral: true,
    });
  }

  private async checkExpiredGiveaways(): Promise<void> {
    const db = this.context.db.getDb() as any;
    const messages = getMessages(this.context);

    const expired = await db.select().from(this.tables.giveaways).where(
      and(
        lte(this.tables.giveaways.endsAt, Date.now()),
        eq(this.tables.giveaways.ended, 0),
      ),
    );

    for (const giveaway of expired) {
      if (!(await this.context.modules.isEnabled(giveaway.guildId))) continue;

      try {
        const entries = await db.select().from(this.tables.entries).where(eq(this.tables.entries.giveawayId, giveaway.id));
        const winners = pickRandomWinners(entries, giveaway.winnerCount);
        const winnersText = formatWinners(winners, messages);

        await db.update(this.tables.giveaways).set({ ended: 1 }).where(eq(this.tables.giveaways.id, giveaway.id));
        await editGiveawayMessage(this.context, giveaway, buildEndedEmbed(this.context, messages, giveaway, winnersText));
        await dmWinners(this.context, winners, giveaway, messages);
      } catch (err) {
        this.context.logger.warn(`Failed to end giveaway ${giveaway.id}: ${err}`);
      }
    }
  }
}
