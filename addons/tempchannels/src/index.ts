import { Addon } from '@omni/core';
import type { VoiceState, VoiceChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import { eq, and, sql } from 'drizzle-orm';

import {
  sqliteHubs, sqliteActive,
  mysqlHubs, mysqlActive,
  SQLITE_CREATE_HUBS, SQLITE_CREATE_ACTIVE,
  MYSQL_CREATE_HUBS, MYSQL_CREATE_ACTIVE,
} from './schema';

import { CONFIG_DEFAULTS, CONFIG_SEED, getConfig } from './utils/common';
import * as tempchannelCmd from './commands/tempchannel';

export interface TempChannelTables {
  hubs: any;
  active: any;
}

export default class TempChannelsAddon extends Addon {
  private tables!: TempChannelTables;

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
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_HUBS));
      await drizzleDb.execute(sql.raw(MYSQL_CREATE_ACTIVE));
    } else {
      drizzleDb.run(sql.raw(SQLITE_CREATE_HUBS));
      drizzleDb.run(sql.raw(SQLITE_CREATE_ACTIVE));
    }

    const isMysql = db.driver === 'mysql';
    this.tables = {
      hubs: isMysql ? mysqlHubs : sqliteHubs,
      active: isMysql ? mysqlActive : sqliteActive,
    };

    db.registerSchema(this.tables.hubs);
    db.registerSchema(this.tables.active);

    tempchannelCmd.register(this.context, this.tables);

    logger.info('Temp Channels addon loaded - 1 command registered');
  }

  async onEnable(): Promise<void> {
    const { events, logger } = this.context;

    await this.cleanupStaleChannels();

    events.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
      try {
        await this.handleVoiceUpdate(oldState, newState);
      } catch (err) {
        logger.error(`Voice state handler error: ${err}`);
      }
    });

    logger.info('Temp Channels addon enabled');
  }

  async onDisable(): Promise<void> {
    this.context.logger.info('Temp Channels addon disabled');
  }

  private async handleVoiceUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (!(await this.context.modules.isEnabled(newState.guild.id))) return;

    if (newState.channelId) {
      await this.handleJoin(newState);
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await this.handleLeave(oldState);
    }
  }

  private async handleJoin(state: VoiceState): Promise<void> {
    const db = this.context.db.getDb() as any;

    const hubs = await db.select().from(this.tables.hubs).where(
      and(
        eq(this.tables.hubs.guildId, state.guild.id),
        eq(this.tables.hubs.channelId, state.channelId!),
      ),
    );

    if (hubs.length === 0) return;

    const hubChannel = state.channel as VoiceChannel;
    const config = getConfig(this.context);
    const member = state.member!;
    const channelName = config.channelNameTemplate.replaceAll('{username}', member.displayName);

    try {
      const newChannel = await state.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: hubChannel.parent,
        userLimit: config.userLimit || undefined,
      });

      await state.setChannel(newChannel);

      await db.insert(this.tables.active).values({
        guildId: state.guild.id,
        channelId: newChannel.id,
        ownerId: member.id,
        hubId: state.channelId!,
        createdAt: Date.now(),
      });
    } catch (err) {
      this.context.logger.warn(`Failed to create temp channel: ${err}`);
    }
  }

  private async handleLeave(state: VoiceState): Promise<void> {
    const db = this.context.db.getDb() as any;

    const rows = await db.select().from(this.tables.active).where(
      eq(this.tables.active.channelId, state.channelId!),
    );

    if (rows.length === 0) return;
    if (state.channel && state.channel.members.size > 0) return;

    try {
      if (state.channel) await state.channel.delete();
    } catch {}

    await db.delete(this.tables.active).where(
      eq(this.tables.active.channelId, state.channelId!),
    );
  }

  private async cleanupStaleChannels(): Promise<void> {
    const db = this.context.db.getDb() as any;
    const { logger, client } = this.context;

    const rows = await db.select().from(this.tables.active);

    for (const row of rows) {
      let shouldRemove = false;

      try {
        const guild = await client.guilds.fetch(row.guildId);
        const channel = await guild.channels.fetch(row.channelId).catch(() => null);

        if (!channel || (channel as VoiceChannel).members.size === 0) {
          if (channel) {
            try { await channel.delete(); } catch {}
          }
          shouldRemove = true;
        }
      } catch {
        shouldRemove = true;
      }

      if (shouldRemove) {
        await db.delete(this.tables.active).where(eq(this.tables.active.id, row.id));
        logger.debug(`Cleaned up stale temp channel ${row.channelId}`);
      }
    }
  }
}
