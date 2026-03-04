import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and, desc } from 'drizzle-orm';
import { getMessages, msg } from '../utils/common';
import type { ModerationTables } from '../index';

export function register(context: AddonContext, tables: ModerationTables): void {
  const { actions } = tables;
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('View active warnings for a user')
      .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true)),
    permission: 'moderation.history',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user', true);
      const guild = interaction.guild!;
      const db = context.db.getDb() as any;

      const lastClear = await db.select({ id: actions.id })
        .from(actions)
        .where(and(
          eq(actions.guildId, guild.id),
          eq(actions.targetId, target.id),
          eq(actions.action, 'clearwarnings'),
        ))
        .orderBy(desc(actions.createdAt))
        .limit(1);

      const sinceId = lastClear.length > 0 ? lastClear[0].id : 0;

      const rows = await db.select()
        .from(actions)
        .where(and(
          eq(actions.guildId, guild.id),
          eq(actions.targetId, target.id),
          eq(actions.action, 'warn'),
        ))
        .orderBy(desc(actions.createdAt));

      const activeWarnings = rows.filter((r: any) => r.id > sinceId);

      if (activeWarnings.length === 0) {
        await interaction.reply({ embeds: [context.embeds.info('No Warnings', msg(messages, 'noWarnings', { user: target.tag }))] });
        return;
      }

      const fields = activeWarnings.slice(0, 25).map((w: any) => ({
        name: `#${w.id} — <t:${Math.floor(w.createdAt / 1000)}:R>`,
        value: `**Reason:** ${w.reason ?? 'No reason'}\n**By:** <@${w.moderatorId}>`,
      }));

      await interaction.reply({ embeds: [context.embeds.info(
        `Warnings for ${target.tag}`,
        `**${activeWarnings.length}** active warning(s)`,
        { fields },
      )] });
    },
  });
}
