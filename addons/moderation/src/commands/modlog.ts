import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, desc } from 'drizzle-orm';
import { formatDuration } from '../utils/duration';
import { ACTION_LABELS, getMessages, msg } from '../utils/common';
import type { ModerationTables } from '../index';

export function register(context: AddonContext, tables: ModerationTables): void {
  const { actions } = tables;
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('modlog')
      .setDescription('View recent moderation actions in this server')
      .addIntegerOption(opt =>
        opt.setName('limit').setDescription('Number of entries to show (1-50)')
          .setMinValue(1).setMaxValue(50),
      ),
    permission: 'moderation.history',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const limit = interaction.options.getInteger('limit') ?? 10;
      const guild = interaction.guild!;
      const db = context.db.getDb() as any;

      const rows = await db.select()
        .from(actions)
        .where(eq(actions.guildId, guild.id))
        .orderBy(desc(actions.createdAt))
        .limit(limit);

      if (rows.length === 0) {
        await interaction.reply({ embeds: [context.embeds.info('Empty Mod Log', msg(messages, 'emptyModLog'))] });
        return;
      }

      const fields = rows.map((row: any) => {
        const label = ACTION_LABELS[row.action] ?? row.action;
        const duration = row.duration ? ` (${formatDuration(row.duration)})` : '';
        return {
          name: `#${row.id} ${label}${duration} — <t:${Math.floor(row.createdAt / 1000)}:R>`,
          value: `**Target:** <@${row.targetId}>\n**By:** <@${row.moderatorId}>\n**Reason:** ${row.reason ?? 'No reason'}`,
        };
      });

      await interaction.reply({ embeds: [context.embeds.info(
        'Mod Log',
        `Showing ${rows.length} most recent action(s)`,
        { fields },
      )] });
    },
  });
}
