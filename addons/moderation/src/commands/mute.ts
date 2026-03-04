import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { canModerate } from '../utils/hierarchy';
import { parseDuration, formatDuration } from '../utils/duration';
import { getConfig, getMessages, msg, tryDmUser, type Helpers } from '../utils/common';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 28 days (Discord limit)

export function register(context: AddonContext, _tables: unknown, helpers: Helpers): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Mute a user (Discord timeout)')
      .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
      .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 30m, 7d - max 28 days)').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the mute')),
    permission: 'moderation.mute',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const durationStr = interaction.options.getString('duration', true);
      const config = getConfig(context);
      const reason = interaction.options.getString('reason') ?? config.defaultReason;
      const guild = interaction.guild!;

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        await interaction.reply({ embeds: [context.embeds.error('Invalid Duration', 'Use a format like `1h`, `30m`, or `7d`.')], ephemeral: true });
        return;
      }

      if (durationMs > MAX_TIMEOUT_MS) {
        await interaction.reply({ embeds: [context.embeds.error('Duration Too Long', 'Discord timeouts cannot exceed **28 days**.')], ephemeral: true });
        return;
      }

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) {
        await interaction.reply({ embeds: [context.embeds.error('Not Found', 'That user is not in this server.')], ephemeral: true });
        return;
      }

      const check = canModerate(interaction.member as any, member, guild.members.me!);
      if (!check.allowed) {
        await interaction.reply({ embeds: [context.embeds.error('Cannot Mute', check.reason!)], ephemeral: true });
        return;
      }

      await member.timeout(durationMs, reason);

      let dmSent = false;
      if (config.dmOnAction) {
        dmSent = await tryDmUser(target, context.embeds.warning(
          msg(messages, 'dmMuted'), `**Server:** ${guild.name}\n**Duration:** ${formatDuration(durationMs)}\n**Reason:** ${reason}`,
        ));
      }

      const caseId = await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'mute', reason, duration: durationMs, expiresAt: Date.now() + durationMs, createdAt: Date.now(),
      });

      context.events.emit('moderation:mute', guild.id, target.id, interaction.user.id, reason, durationMs);

      const body = msg(messages, 'muted', { user: target.tag, reason, duration: formatDuration(durationMs) })
        + (!dmSent && config.dmOnAction ? msg(messages, 'dmFailed') : '');
      await interaction.reply({ embeds: [context.embeds.success('User Muted', body, { footer: `Case #${caseId}` })] });

      await helpers.sendModLog(guild.id, 'Member Muted', [
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Reason', value: reason },
        { name: 'Case', value: `#${caseId}`, inline: true },
      ], 'warning');
    },
  });

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Unmute a user (remove timeout)')
      .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the unmute')),
    permission: 'moderation.mute',
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

      if (!member.isCommunicationDisabled()) {
        await interaction.reply({ embeds: [context.embeds.error('Not Muted', 'That user is not currently muted.')], ephemeral: true });
        return;
      }

      await member.timeout(null, reason);

      const caseId = await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'unmute', reason, createdAt: Date.now(),
      });

      context.events.emit('moderation:unmute', guild.id, target.id, interaction.user.id, reason);

      await interaction.reply({ embeds: [context.embeds.success(
        'User Unmuted', msg(messages, 'unmuted', { user: target.tag, reason }),
        { footer: `Case #${caseId}` },
      )] });

      await helpers.sendModLog(guild.id, 'Member Unmuted', [
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Case', value: `#${caseId}`, inline: true },
      ], 'info');
    },
  });
}
