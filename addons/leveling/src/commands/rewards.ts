import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and } from 'drizzle-orm';
import type { LevelingTables } from '../index';

export function register(context: AddonContext, tables: LevelingTables): void {
  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('rewards')
      .setDescription('Manage level role rewards')
      .addSubcommand(sub =>
        sub.setName('add').setDescription('Add a role reward at a level')
          .addIntegerOption(opt => opt.setName('level').setDescription('Level threshold').setMinValue(1).setRequired(true))
          .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(true)),
      )
      .addSubcommand(sub =>
        sub.setName('remove').setDescription('Remove a role reward at a level')
          .addIntegerOption(opt => opt.setName('level').setDescription('Level to remove reward from').setMinValue(1).setRequired(true)),
      )
      .addSubcommand(sub =>
        sub.setName('list').setDescription('List all role rewards'),
      ),
    permission: 'leveling.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId!;
      const db = context.db.getDb() as any;

      switch (sub) {
        case 'add': {
          const level = interaction.options.getInteger('level', true);
          const role = interaction.options.getRole('role', true);

          const existing = await db.select().from(tables.roleRewards).where(
            and(eq(tables.roleRewards.guildId, guildId), eq(tables.roleRewards.level, level)),
          );

          if (existing.length > 0) {
            await db.update(tables.roleRewards)
              .set({ roleId: role.id })
              .where(and(eq(tables.roleRewards.guildId, guildId), eq(tables.roleRewards.level, level)));
          } else {
            await db.insert(tables.roleRewards).values({
              guildId,
              level,
              roleId: role.id,
            });
          }

          await interaction.reply({
            embeds: [context.embeds.success('Reward Added', `${role} will be assigned at **Level ${level}**.`)],
          });
          break;
        }

        case 'remove': {
          const level = interaction.options.getInteger('level', true);

          const existing = await db.select().from(tables.roleRewards).where(
            and(eq(tables.roleRewards.guildId, guildId), eq(tables.roleRewards.level, level)),
          );

          if (existing.length === 0) {
            await interaction.reply({
              embeds: [context.embeds.error('Not Found', `No role reward exists at Level ${level}.`)],
              ephemeral: true,
            });
            return;
          }

          await db.delete(tables.roleRewards).where(
            and(eq(tables.roleRewards.guildId, guildId), eq(tables.roleRewards.level, level)),
          );

          await interaction.reply({
            embeds: [context.embeds.success('Reward Removed', `Removed the role reward at **Level ${level}**.`)],
          });
          break;
        }

        case 'list': {
          const rewards = await db.select().from(tables.roleRewards)
            .where(eq(tables.roleRewards.guildId, guildId))
            .orderBy(tables.roleRewards.level);

          if (rewards.length === 0) {
            await interaction.reply({
              embeds: [context.embeds.info('Role Rewards', 'No role rewards configured.')],
              ephemeral: true,
            });
            return;
          }

          const lines = rewards.map((r: any) => `**Level ${r.level}** - <@&${r.roleId}>`);

          await interaction.reply({
            embeds: [context.embeds.info('Role Rewards', lines.join('\n'))],
          });
          break;
        }
      }
    },
  });
}
