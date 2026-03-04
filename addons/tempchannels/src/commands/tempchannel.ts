import {
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and } from 'drizzle-orm';
import { getMessages, msg } from '../utils/common';
import type { TempChannelTables } from '../index';

function hubWhere(tables: TempChannelTables, guildId: string, channelId: string) {
  return and(eq(tables.hubs.guildId, guildId), eq(tables.hubs.channelId, channelId));
}

export function register(context: AddonContext, tables: TempChannelTables): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('tempchannel')
      .setDescription('Manage temporary voice channels')
      .addSubcommand(sub =>
        sub.setName('sethub').setDescription('Designate a voice channel as a temp channel hub')
          .addChannelOption(opt =>
            opt.setName('channel').setDescription('The voice channel to use as a hub')
              .addChannelTypes(ChannelType.GuildVoice)
              .setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('removehub').setDescription('Remove a hub designation')
          .addChannelOption(opt =>
            opt.setName('channel').setDescription('The hub channel to remove')
              .addChannelTypes(ChannelType.GuildVoice)
              .setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('list').setDescription('List all hubs and active temp channels'),
      ),
    permission: 'tempchannels.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const sub = interaction.options.getSubcommand();

      if (sub === 'sethub') {
        await handleSetHub(context, interaction, tables, messages);
      } else if (sub === 'removehub') {
        await handleRemoveHub(context, interaction, tables, messages);
      } else if (sub === 'list') {
        await handleList(context, interaction, tables, messages);
      }
    },
  });
}

async function handleSetHub(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: TempChannelTables,
  messages: ReturnType<typeof getMessages>,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  const db = context.db.getDb() as any;

  const where = hubWhere(tables, interaction.guildId!, channel.id);
  const existing = await db.select().from(tables.hubs).where(where);

  if (existing.length > 0) {
    await interaction.reply({
      embeds: [context.embeds.error('Already a Hub', msg(messages, 'hubAlreadySet', { channel: `<#${channel.id}>` }))],
      ephemeral: true,
    });
    return;
  }

  await db.insert(tables.hubs).values({
    guildId: interaction.guildId!,
    channelId: channel.id,
  });

  await interaction.reply({
    embeds: [context.embeds.success('Hub Added', msg(messages, 'hubAdded', { channel: `<#${channel.id}>` }))],
  });
}

async function handleRemoveHub(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: TempChannelTables,
  messages: ReturnType<typeof getMessages>,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  const db = context.db.getDb() as any;

  const where = hubWhere(tables, interaction.guildId!, channel.id);
  const existing = await db.select().from(tables.hubs).where(where);

  if (existing.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.error('Not a Hub', msg(messages, 'hubNotFound', { channel: `<#${channel.id}>` }))],
      ephemeral: true,
    });
    return;
  }

  await db.delete(tables.hubs).where(where);

  await interaction.reply({
    embeds: [context.embeds.success('Hub Removed', msg(messages, 'hubRemoved', { channel: `<#${channel.id}>` }))],
  });
}

async function handleList(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: TempChannelTables,
  messages: ReturnType<typeof getMessages>,
): Promise<void> {
  const db = context.db.getDb() as any;

  const hubs = await db.select().from(tables.hubs).where(
    eq(tables.hubs.guildId, interaction.guildId!),
  );

  if (hubs.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.info('Temp Channels', msg(messages, 'noHubs'))],
    });
    return;
  }

  const active = await db.select().from(tables.active).where(
    eq(tables.active.guildId, interaction.guildId!),
  );

  const lines: string[] = [];

  lines.push('**Hubs:**');
  for (const hub of hubs) {
    lines.push(`- <#${hub.channelId}>`);
  }

  if (active.length > 0) {
    lines.push('');
    lines.push('**Active Temp Channels:**');
    for (const ch of active) {
      lines.push(`- <#${ch.channelId}> (by <@${ch.ownerId}>)`);
    }
  } else {
    lines.push('');
    lines.push('No active temp channels.');
  }

  await interaction.reply({
    embeds: [context.embeds.info('Temp Channels', lines.join('\n'))],
  });
}
