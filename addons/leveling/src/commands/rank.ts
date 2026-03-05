import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and, desc, gt } from 'drizzle-orm';
import { computeLevel, xpForLevel, xpToNextLevel, levelProgress, progressBar, getMessages, msg } from '../utils/common';
import type { LevelingTables } from '../index';

export function register(context: AddonContext, tables: LevelingTables): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('View your level and XP')
      .addUserOption(opt => opt.setName('user').setDescription('User to check')),
    execute: async (interaction: ChatInputCommandInteraction) => {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const guildId = interaction.guildId!;
      const db = context.db.getDb() as any;

      const rows = await db.select().from(tables.levels).where(
        and(eq(tables.levels.guildId, guildId), eq(tables.levels.userId, target.id)),
      );

      if (rows.length === 0) {
        await interaction.reply({
          embeds: [context.embeds.info('Rank', msg(messages, 'noData'))],
          ephemeral: true,
        });
        return;
      }

      const row = rows[0];
      const level = computeLevel(row.xp);
      const nextXp = xpForLevel(level + 1);
      const progress = levelProgress(row.xp);
      const bar = progressBar(progress, 12);

      const allUsers = await db.select().from(tables.levels)
        .where(and(eq(tables.levels.guildId, guildId), gt(tables.levels.xp, 0)))
        .orderBy(desc(tables.levels.xp));
      const rank = allUsers.findIndex((u: any) => u.userId === target.id) + 1;

      await interaction.reply({
        embeds: [context.embeds.info(
          `${target.displayName}'s Rank`,
          [
            `**Rank:** #${rank}`,
            `**Level:** ${level}`,
            `**XP:** ${row.xp.toLocaleString()} / ${nextXp.toLocaleString()}`,
            `**Progress:** ${bar} ${Math.round(progress * 100)}%`,
            `**XP to next level:** ${xpToNextLevel(row.xp).toLocaleString()}`,
          ].join('\n'),
          { thumbnail: target.displayAvatarURL() },
        )],
      });
    },
  });

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('View the XP leaderboard')
      .addIntegerOption(opt =>
        opt.setName('page').setDescription('Page number').setMinValue(1),
      ),
    execute: async (interaction: ChatInputCommandInteraction) => {
      const page = interaction.options.getInteger('page') ?? 1;
      const perPage = 10;
      const offset = (page - 1) * perPage;
      const guildId = interaction.guildId!;
      const db = context.db.getDb() as any;

      const allUsers = await db.select().from(tables.levels)
        .where(and(eq(tables.levels.guildId, guildId), gt(tables.levels.xp, 0)))
        .orderBy(desc(tables.levels.xp));

      const totalPages = Math.max(1, Math.ceil(allUsers.length / perPage));
      const pageUsers = allUsers.slice(offset, offset + perPage);

      if (pageUsers.length === 0) {
        await interaction.reply({
          embeds: [context.embeds.info('Leaderboard', msg(messages, 'noData'))],
          ephemeral: true,
        });
        return;
      }

      const lines = pageUsers.map((row: any, i: number) => {
        const rank = offset + i + 1;
        const level = computeLevel(row.xp);
        return `**${rank}.** <@${row.userId}> - Level ${level} (${row.xp.toLocaleString()} XP)`;
      });

      await interaction.reply({
        embeds: [context.embeds.info(
          'Leaderboard',
          lines.join('\n'),
          { footer: `Page ${page} of ${totalPages}` },
        )],
      });
    },
  });
}
