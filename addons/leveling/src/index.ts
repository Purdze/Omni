import { Addon } from '@omni/core';
import type { Message, TextChannel, GuildMember } from 'discord.js';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import {
  sqliteLevels, sqliteRoleRewards,
  mysqlLevels, mysqlRoleRewards,
  SQLITE_CREATE_LEVELS, SQLITE_CREATE_ROLE_REWARDS,
  MYSQL_CREATE_LEVELS, MYSQL_CREATE_ROLE_REWARDS,
} from './schema';

import {
  type LevelingConfig,
  CONFIG_DEFAULTS, CONFIG_SEED, getConfig, getMessages, msg,
  computeLevel,
} from './utils/common';
import * as rankCmd from './commands/rank';
import * as xpCmd from './commands/xp';
import * as rewardsCmd from './commands/rewards';

export interface LevelingTables {
  levels: any;
  roleRewards: any;
}

export type UpsertXpFn = (
  guildId: string,
  userId: string,
  amount: number,
  absolute?: boolean,
) => Promise<{ xp: number; level: number; leveledUp: boolean }>;

export type LevelingAPI = {
  getLevel(guildId: string, userId: string): Promise<number>;
  getXp(guildId: string, userId: string): Promise<number>;
  addXp(guildId: string, userId: string, amount: number): Promise<{ xp: number; level: number; leveledUp: boolean }>;
  getLeaderboard(guildId: string, limit?: number): Promise<{ userId: string; xp: number; level: number }[]>;
};

export default class LevelingAddon extends Addon {
  private tables!: LevelingTables;

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
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_LEVELS));
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_ROLE_REWARDS));
    } else {
      drizzleDb.run(sql.raw(SQLITE_CREATE_LEVELS));
      drizzleDb.run(sql.raw(SQLITE_CREATE_ROLE_REWARDS));
    }

    const isMysql = db.driver === 'mysql';
    this.tables = {
      levels: isMysql ? mysqlLevels : sqliteLevels,
      roleRewards: isMysql ? mysqlRoleRewards : sqliteRoleRewards,
    };

    db.registerSchema(this.tables.levels);
    db.registerSchema(this.tables.roleRewards);

    rankCmd.register(this.context, this.tables);
    xpCmd.register(this.context, this.tables, this.upsertXp.bind(this));
    rewardsCmd.register(this.context, this.tables);

    logger.info('Leveling addon loaded - 5 commands registered');
  }

  async onEnable(): Promise<void> {
    const { events, logger, addons } = this.context;

    events.on('messageCreate', async (message: Message) => {
      if (!message.guild) return;
      if (message.author.bot) return;
      if (!(await this.context.modules.isEnabled(message.guild.id))) return;

      await this.handleMessage(message);
    });

    addons.expose<LevelingAPI>({
      getLevel: async (guildId, userId) => {
        const row = await this.getRow(guildId, userId);
        return row ? computeLevel(row.xp) : 0;
      },
      getXp: async (guildId, userId) => {
        const row = await this.getRow(guildId, userId);
        return row ? row.xp : 0;
      },
      addXp: (guildId, userId, amount) => this.upsertXp(guildId, userId, amount),
      getLeaderboard: async (guildId, limit = 10) => {
        const db = this.context.db.getDb() as any;
        const rows = await db.select().from(this.tables.levels)
          .where(eq(this.tables.levels.guildId, guildId))
          .orderBy(desc(this.tables.levels.xp))
          .limit(limit);
        return rows.map((r: any) => ({ userId: r.userId, xp: r.xp, level: computeLevel(r.xp) }));
      },
    });

    logger.info('Leveling addon enabled');
  }

  async onDisable(): Promise<void> {
    this.context.logger.info('Leveling addon disabled');
  }

  private async getRow(guildId: string, userId: string): Promise<any | null> {
    const db = this.context.db.getDb() as any;
    const rows = await db.select().from(this.tables.levels).where(
      and(eq(this.tables.levels.guildId, guildId), eq(this.tables.levels.userId, userId)),
    );
    return rows.length > 0 ? rows[0] : null;
  }

  private async upsertXp(
    guildId: string,
    userId: string,
    amount: number,
    absolute: boolean = false,
    lastXpAt?: number,
  ): Promise<{ xp: number; level: number; leveledUp: boolean }> {
    const db = this.context.db.getDb() as any;
    const existing = await this.getRow(guildId, userId);
    const oldLevel = existing ? computeLevel(existing.xp) : 0;

    const newXp = absolute
      ? Math.max(0, amount)
      : Math.max(0, (existing ? existing.xp : 0) + amount);
    const newLevel = computeLevel(newXp);

    const updates: Record<string, number> = { xp: newXp, level: newLevel };
    if (lastXpAt !== undefined) updates.lastXpAt = lastXpAt;

    if (existing) {
      await db.update(this.tables.levels)
        .set(updates)
        .where(and(eq(this.tables.levels.guildId, guildId), eq(this.tables.levels.userId, userId)));
    } else {
      await db.insert(this.tables.levels).values({
        guildId,
        userId,
        xp: newXp,
        level: newLevel,
        lastXpAt: lastXpAt ?? 0,
      });
    }

    return { xp: newXp, level: newLevel, leveledUp: newLevel > oldLevel };
  }

  private async handleMessage(message: Message): Promise<void> {
    const guildId = message.guild!.id;
    const userId = message.author.id;
    const config = getConfig(this.context);
    const now = Date.now();

    const existing = await this.getRow(guildId, userId);
    if (existing) {
      const elapsed = (now - existing.lastXpAt) / 1000;
      if (elapsed < config.xpCooldown) return;
    }

    const xpGain = Math.floor(Math.random() * (config.xpMax - config.xpMin + 1)) + config.xpMin;
    const result = await this.upsertXp(guildId, userId, xpGain, false, now);

    if (result.leveledUp) {
      await this.onLevelUp(message, result.level, config);
    }
  }

  private async resolveChannel(config: LevelingConfig, fallback: TextChannel): Promise<TextChannel> {
    if (config.levelUpChannelId) {
      return await this.context.client.channels.fetch(config.levelUpChannelId) as TextChannel;
    }
    return fallback;
  }

  private async onLevelUp(message: Message, newLevel: number, config: LevelingConfig): Promise<void> {
    const messages = getMessages(this.context);

    if (config.levelUpMessage) {
      const text = msg(messages, 'levelUp', {
        user: `${message.author}`,
        level: `${newLevel}`,
      });

      try {
        const channel = await this.resolveChannel(config, message.channel as TextChannel);
        await channel.send({ embeds: [this.context.embeds.info('Level Up!', text)] });
      } catch (err) {
        this.context.logger.warn(`Failed to send level-up message: ${err}`);
      }
    }

    await this.applyRoleRewards(message.guild!.id, message.member!, newLevel, config, messages);
  }

  private async applyRoleRewards(
    guildId: string,
    member: GuildMember,
    newLevel: number,
    config: LevelingConfig,
    messages: ReturnType<typeof getMessages>,
  ): Promise<void> {
    const db = this.context.db.getDb() as any;

    const allRewards = await db.select().from(this.tables.roleRewards)
      .where(eq(this.tables.roleRewards.guildId, guildId))
      .orderBy(this.tables.roleRewards.level);

    const earnedRewards = allRewards.filter((r: any) => r.level <= newLevel);
    if (earnedRewards.length === 0) return;

    try {
      if (config.stackRoles) {
        for (const reward of earnedRewards) {
          if (!member.roles.cache.has(reward.roleId)) {
            await member.roles.add(reward.roleId).catch(() => {});
          }
        }
      } else {
        const highestReward = earnedRewards[earnedRewards.length - 1];

        for (const reward of earnedRewards) {
          if (reward.roleId !== highestReward.roleId && member.roles.cache.has(reward.roleId)) {
            await member.roles.remove(reward.roleId).catch(() => {});
          }
        }

        if (!member.roles.cache.has(highestReward.roleId)) {
          await member.roles.add(highestReward.roleId).catch(() => {});
        }
      }

      const rewardAtLevel = allRewards.find((r: any) => r.level === newLevel);
      if (rewardAtLevel && config.levelUpChannelId) {
        const text = msg(messages, 'roleReward', {
          user: `${member.user}`,
          role: `<@&${rewardAtLevel.roleId}>`,
          level: `${newLevel}`,
        });

        try {
          const channel = await this.context.client.channels.fetch(config.levelUpChannelId) as TextChannel;
          await channel.send({ embeds: [this.context.embeds.info('Role Reward!', text)] });
        } catch {
          // Channel may have been deleted
        }
      }
    } catch (err) {
      this.context.logger.warn(`Failed to apply role rewards: ${err}`);
    }
  }
}
