import { SlashCommandBuilder, ChannelType, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { getMessages, msg } from '../utils/common';

export function register(context: AddonContext): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Lock a channel (deny @everyone from sending messages)')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Channel to lock (defaults to current)')
          .addChannelTypes(ChannelType.GuildText),
      ),
    permission: 'moderation.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel;
      await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: false });

      await interaction.reply({ embeds: [context.embeds.success('Channel Locked', msg(messages, 'channelLocked', { channel: `${channel}` }))] });
    },
  });

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Unlock a channel (reset @everyone send messages permission)')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Channel to unlock (defaults to current)')
          .addChannelTypes(ChannelType.GuildText),
      ),
    permission: 'moderation.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel;
      await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: null });

      await interaction.reply({ embeds: [context.embeds.success('Channel Unlocked', msg(messages, 'channelUnlocked', { channel: `${channel}` }))] });
    },
  });
}
