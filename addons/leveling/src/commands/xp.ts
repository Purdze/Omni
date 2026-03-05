import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import type { LevelingTables, UpsertXpFn } from '../index';

export function register(context: AddonContext, tables: LevelingTables, upsertXp: UpsertXpFn): void {
  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('xp')
      .setDescription('Manage user XP')
      .addSubcommand(sub =>
        sub.setName('set').setDescription('Set a user\'s XP')
          .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
          .addIntegerOption(opt => opt.setName('amount').setDescription('XP amount').setMinValue(0).setRequired(true)),
      )
      .addSubcommand(sub =>
        sub.setName('add').setDescription('Add XP to a user')
          .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
          .addIntegerOption(opt => opt.setName('amount').setDescription('XP to add').setMinValue(1).setRequired(true)),
      )
      .addSubcommand(sub =>
        sub.setName('remove').setDescription('Remove XP from a user')
          .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
          .addIntegerOption(opt => opt.setName('amount').setDescription('XP to remove').setMinValue(1).setRequired(true)),
      ),
    permission: 'leveling.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const guildId = interaction.guildId!;

      let result: { xp: number; level: number; leveledUp: boolean };

      switch (sub) {
        case 'set':
          result = await upsertXp(guildId, target.id, amount, true);
          await interaction.reply({
            embeds: [context.embeds.success('XP Set', `Set ${target}'s XP to **${result.xp.toLocaleString()}** (Level ${result.level}).`)],
          });
          break;

        case 'add':
          result = await upsertXp(guildId, target.id, amount);
          await interaction.reply({
            embeds: [context.embeds.success('XP Added', `Added **${amount.toLocaleString()}** XP to ${target}. They now have **${result.xp.toLocaleString()}** XP (Level ${result.level}).`)],
          });
          break;

        case 'remove':
          result = await upsertXp(guildId, target.id, -amount);
          await interaction.reply({
            embeds: [context.embeds.success('XP Removed', `Removed **${amount.toLocaleString()}** XP from ${target}. They now have **${result.xp.toLocaleString()}** XP (Level ${result.level}).`)],
          });
          break;
      }
    },
  });
}
