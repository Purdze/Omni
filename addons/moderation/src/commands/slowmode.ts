import { SlashCommandBuilder, ChannelType, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { getMessages, msg } from '../utils/common';

export function register(context: AddonContext): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Set the slowmode for a channel')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('The channel to modify').setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      )
      .addIntegerOption(opt =>
        opt.setName('seconds').setDescription('Slowmode in seconds (0 to remove)')
          .setRequired(true).setMinValue(0).setMaxValue(21600),
      ),
    permission: 'moderation.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const channel = interaction.options.getChannel('channel', true) as TextChannel;
      const seconds = interaction.options.getInteger('seconds', true);
      await channel.setRateLimitPerUser(seconds);

      const body = seconds > 0
        ? msg(messages, 'slowmodeSet', { seconds: `${seconds}`, channel: `${channel}` })
        : msg(messages, 'slowmodeRemoved', { channel: `${channel}` });

      await interaction.reply({ embeds: [context.embeds.success(seconds > 0 ? 'Slowmode Set' : 'Slowmode Removed', body)] });
    },
  });
}
