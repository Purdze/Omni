import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and } from 'drizzle-orm';
import { canModerate } from '../utils/hierarchy';
import { parseDuration, formatDuration } from '../utils/duration';
import { getConfig, getMessages, msg, tryDmUser, type Helpers } from '../utils/common';
import type { ModerationTables } from '../index';

export function register(context: AddonContext, tables: ModerationTables, helpers: Helpers): void {
  const { tempbans } = tables;
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a user from the server')
      .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban'))
      .addIntegerOption(opt =>
        opt.setName('delete_days').setDescription('Days of messages to delete (0-7)')
          .setMinValue(0).setMaxValue(7),
      ),
    permission: 'moderation.ban',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const config = getConfig(context);
      const reason = interaction.options.getString('reason') ?? config.defaultReason;
      const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
      const guild = interaction.guild!;

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (member) {
        const check = canModerate(interaction.member as any, member, guild.members.me!);
        if (!check.allowed) {
          await interaction.reply({ embeds: [context.embeds.error('Cannot Ban', check.reason!)], ephemeral: true });
          return;
        }
      }

      let dmSent = false;
      if (config.dmOnAction && member) {
        dmSent = await tryDmUser(target, context.embeds.error(
          msg(messages, 'dmBanned'), `**Server:** ${guild.name}\n**Reason:** ${reason}`,
        ));
      }

      await guild.members.ban(target.id, { reason, deleteMessageSeconds: deleteDays * 86400 });

      const caseId = await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'ban', reason, createdAt: Date.now(),
      });

      context.events.emit('moderation:ban', guild.id, target.id, interaction.user.id, reason);

      const body = msg(messages, 'banned', { user: target.tag, reason })
        + (!dmSent && config.dmOnAction && member ? msg(messages, 'dmFailed') : '');
      await interaction.reply({ embeds: [context.embeds.success('User Banned', body, { footer: `Case #${caseId}` })] });

      await helpers.sendModLog(guild.id, 'Member Banned', [
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Case', value: `#${caseId}`, inline: true },
      ], 'warning');
    },
  });

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('tempban')
      .setDescription('Temporarily ban a user')
      .addUserOption(opt => opt.setName('user').setDescription('User to tempban').setRequired(true))
      .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1d12h, 30m, 2w)').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban')),
    permission: 'moderation.ban',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const durationStr = interaction.options.getString('duration', true);
      const config = getConfig(context);
      const reason = interaction.options.getString('reason') ?? config.defaultReason;
      const guild = interaction.guild!;

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        await interaction.reply({ embeds: [context.embeds.error('Invalid Duration', 'Use a format like `1d12h`, `30m`, or `2w`.')], ephemeral: true });
        return;
      }

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (member) {
        const check = canModerate(interaction.member as any, member, guild.members.me!);
        if (!check.allowed) {
          await interaction.reply({ embeds: [context.embeds.error('Cannot Tempban', check.reason!)], ephemeral: true });
          return;
        }
      }

      let dmSent = false;
      if (config.dmOnAction && member) {
        dmSent = await tryDmUser(target, context.embeds.error(
          msg(messages, 'dmTempbanned'), `**Server:** ${guild.name}\n**Duration:** ${formatDuration(durationMs)}\n**Reason:** ${reason}`,
        ));
      }

      await guild.members.ban(target.id, { reason: `[Tempban: ${durationStr}] ${reason}` });

      const expiresAt = Date.now() + durationMs;
      const caseId = await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'tempban', reason, duration: durationMs, expiresAt, createdAt: Date.now(),
      });

      const db = context.db.getDb() as any;
      await db.insert(tempbans).values({
        guildId: guild.id, targetId: target.id, expiresAt, actionId: caseId,
      });

      context.events.emit('moderation:tempban', guild.id, target.id, interaction.user.id, reason, durationMs);

      const body = msg(messages, 'tempbanned', { user: target.tag, reason, duration: formatDuration(durationMs) })
        + (!dmSent && config.dmOnAction && member ? msg(messages, 'dmFailed') : '');
      await interaction.reply({ embeds: [context.embeds.success('User Tempbanned', body, { footer: `Case #${caseId}` })] });

      await helpers.sendModLog(guild.id, 'Member Tempbanned', [
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
      .setName('unban')
      .setDescription('Unban a user from the server')
      .addUserOption(opt => opt.setName('user').setDescription('User to unban').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the unban')),
    permission: 'moderation.ban',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const config = getConfig(context);
      const reason = interaction.options.getString('reason') ?? config.defaultReason;
      const guild = interaction.guild!;

      try {
        await guild.members.unban(target.id, reason);
      } catch {
        await interaction.reply({ embeds: [context.embeds.error('Not Banned', 'That user is not banned from this server.')], ephemeral: true });
        return;
      }

      const db = context.db.getDb() as any;
      await db.delete(tempbans).where(and(
        eq(tempbans.guildId, guild.id),
        eq(tempbans.targetId, target.id),
      ));

      const caseId = await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'unban', reason, createdAt: Date.now(),
      });

      context.events.emit('moderation:unban', guild.id, target.id, interaction.user.id, reason);

      await interaction.reply({ embeds: [context.embeds.success(
        'User Unbanned', msg(messages, 'unbanned', { user: target.tag, reason }),
        { footer: `Case #${caseId}` },
      )] });

      await helpers.sendModLog(guild.id, 'Member Unbanned', [
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Case', value: `#${caseId}`, inline: true },
      ], 'info');
    },
  });
}
