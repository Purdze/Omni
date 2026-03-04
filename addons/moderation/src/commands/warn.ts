import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { canModerate } from '../utils/hierarchy';
import { parseDuration } from '../utils/duration';
import { getConfig, getMessages, msg, tryDmUser, type Helpers } from '../utils/common';
import type { ModerationTables } from '../index';

export function register(context: AddonContext, tables: ModerationTables, helpers: Helpers): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Warn a user')
      .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the warning').setRequired(true)),
    permission: 'moderation.warn',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const guild = interaction.guild!;
      const member = await guild.members.fetch(target.id).catch(() => null);

      if (member) {
        const check = canModerate(interaction.member as any, member, guild.members.me!);
        if (!check.allowed) {
          await interaction.reply({ embeds: [context.embeds.error('Cannot Warn', check.reason!)], ephemeral: true });
          return;
        }
      }

      const caseId = await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'warn', reason, createdAt: Date.now(),
      });

      const count = await helpers.getWarningCount(guild.id, target.id);

      const config = getConfig(context);

      let dmSent = false;
      if (config.dmOnAction) {
        dmSent = await tryDmUser(target, context.embeds.warning(
          msg(messages, 'dmWarned'), `**Server:** ${guild.name}\n**Reason:** ${reason}\n**Warnings:** ${count}`,
        ));
      }

      context.events.emit('moderation:warn', guild.id, target.id, interaction.user.id, reason, count);

      const body = msg(messages, 'warned', { user: `${target}`, reason, count: `${count}` })
        + (!dmSent && config.dmOnAction ? msg(messages, 'dmFailed') : '');
      await interaction.reply({ embeds: [context.embeds.success('User Warned', body, { footer: `Case #${caseId}` })] });

      await helpers.sendModLog(guild.id, 'Member Warned', [
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Warnings', value: `${count}`, inline: true },
        { name: 'Case', value: `#${caseId}`, inline: true },
      ], 'warning');

      if (config.warnThreshold > 0 && count >= config.warnThreshold && member) {
        await handleThreshold(context, tables, helpers, guild, member, interaction.user.id, config, count);
      }
    },
  });

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('clearwarnings')
      .setDescription('Clear all warnings for a user')
      .addUserOption(opt => opt.setName('user').setDescription('User to clear warnings for').setRequired(true)),
    permission: 'moderation.warn',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const guild = interaction.guild!;


      await helpers.insertAction({
        guildId: guild.id, targetId: target.id, moderatorId: interaction.user.id,
        action: 'clearwarnings', createdAt: Date.now(),
      });

      context.events.emit('moderation:clearwarnings', guild.id, target.id, interaction.user.id);

      await interaction.reply({ embeds: [context.embeds.success('Warnings Cleared', msg(messages, 'warningsCleared', { user: `${target}` }))] });

      await helpers.sendModLog(guild.id, 'Warnings Cleared', [
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
      ], 'info');
    },
  });
}

async function handleThreshold(
  context: AddonContext,
  tables: ModerationTables,
  helpers: Helpers,
  guild: any,
  member: any,
  moderatorId: string,
  config: ReturnType<typeof getConfig>,
  warningCount: number,
): Promise<void> {
  const action = config.warnThresholdAction;
  const durationMs = parseDuration(config.warnThresholdDuration);
  const reason = `Auto-action: reached ${warningCount} warnings`;

  try {
    switch (action) {
      case 'kick':
        await member.kick(reason);
        await helpers.insertAction({
          guildId: guild.id, targetId: member.id, moderatorId,
          action: 'kick', reason, createdAt: Date.now(),
        });
        break;

      case 'ban':
        await guild.members.ban(member.id, { reason });
        await helpers.insertAction({
          guildId: guild.id, targetId: member.id, moderatorId,
          action: 'ban', reason, createdAt: Date.now(),
        });
        break;

      case 'tempban':
        if (durationMs) {
          await guild.members.ban(member.id, { reason });
          const expiresAt = Date.now() + durationMs;
          const caseId = await helpers.insertAction({
            guildId: guild.id, targetId: member.id, moderatorId,
            action: 'tempban', reason, duration: durationMs, expiresAt, createdAt: Date.now(),
          });
          const db = context.db.getDb() as any;
          await db.insert(tables.tempbans).values({
            guildId: guild.id, targetId: member.id, expiresAt, actionId: caseId,
          });
        }
        break;

      case 'mute':
      default:
        if (durationMs) {
          await member.timeout(durationMs, reason);
          await helpers.insertAction({
            guildId: guild.id, targetId: member.id, moderatorId,
            action: 'mute', reason, duration: durationMs, expiresAt: Date.now() + durationMs, createdAt: Date.now(),
          });
        }
        break;
    }
  } catch (err) {
    context.logger.warn(`Failed to execute warn threshold action: ${err}`);
  }
}
