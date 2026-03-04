import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { canModerate } from '../utils/hierarchy';
import { getConfig, getMessages, msg, tryDmUser, type Helpers } from '../utils/common';

export function register(context: AddonContext, _tables: unknown, helpers: Helpers): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a user from the server')
      .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick')),
    permission: 'moderation.kick',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const config = getConfig(context);
      const reason = interaction.options.getString('reason') ?? config.defaultReason;
      const guild = interaction.guild!;

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) {
        await interaction.reply({ embeds: [context.embeds.error('Not Found', 'That user is not in this server.')], ephemeral: true });
        return;
      }

      const check = canModerate(interaction.member as any, member, guild.members.me!);
      if (!check.allowed) {
        await interaction.reply({ embeds: [context.embeds.error('Cannot Kick', check.reason!)], ephemeral: true });
        return;
      }

      let dmSent = false;
      if (config.dmOnAction) {
        dmSent = await tryDmUser(target, context.embeds.error(
          msg(messages, 'dmKicked'), `**Server:** ${guild.name}\n**Reason:** ${reason}`,
        ));
      }

      await member.kick(reason);

      const caseId = await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'kick', reason, createdAt: Date.now(),
      });

      context.events.emit('moderation:kick', guild.id, target.id, interaction.user.id, reason);

      const body = msg(messages, 'kicked', { user: target.tag, reason })
        + (!dmSent && config.dmOnAction ? msg(messages, 'dmFailed') : '');
      await interaction.reply({ embeds: [context.embeds.success('User Kicked', body, { footer: `Case #${caseId}` })] });

      await helpers.sendModLog(guild.id, 'Member Kicked', [
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Case', value: `#${caseId}`, inline: true },
      ], 'warning');
    },
  });
}
