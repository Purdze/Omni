import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and, desc } from 'drizzle-orm';
import { formatDuration } from '../utils/duration';
import { ACTION_LABELS, getMessages, msg } from '../utils/common';
import type { ModerationTables } from '../index';

export function register(context: AddonContext, tables: ModerationTables): void {
  const { actions } = tables;
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('history')
      .setDescription('View the full punishment history for a user')
      .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true)),
    permission: 'moderation.history',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const guild = interaction.guild!;
      const db = context.db.getDb() as any;

      const rows = await db.select()
        .from(actions)
        .where(and(
          eq(actions.guildId, guild.id),
          eq(actions.targetId, target.id),
        ))
        .orderBy(desc(actions.createdAt))
        .limit(25);

      if (rows.length === 0) {
        await interaction.reply({ embeds: [context.embeds.info('No History', msg(messages, 'noHistory', { user: target.tag }))] });
        return;
      }

      const fields = rows.map((row: any) => {
        const label = ACTION_LABELS[row.action] ?? row.action;
        const duration = row.duration ? ` (${formatDuration(row.duration)})` : '';
        return {
          name: `#${row.id} ${label}${duration} - <t:${Math.floor(row.createdAt / 1000)}:R>`,
          value: `**Reason:** ${row.reason ?? 'No reason'}\n**By:** <@${row.moderatorId}>`,
        };
      });

      await interaction.reply({ embeds: [context.embeds.info(
        `History for ${target.tag}`,
        `Showing most recent ${rows.length} action(s)`,
        { fields },
      )] });
    },
  });
}
