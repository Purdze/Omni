import {
  SlashCommandBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and } from 'drizzle-orm';
import { parseDuration, formatDuration } from '../utils/duration';
import {
  getConfig, getMessages, msg,
  pickRandomWinners, formatWinners, buildEndedEmbed, editGiveawayMessage, dmWinners,
} from '../utils/common';
import type { GiveawayTables, BuildEmbedFn } from '../index';

export function register(
  context: AddonContext,
  tables: GiveawayTables,
  buildEmbed: BuildEmbedFn,
): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Manage giveaways')
      .addSubcommand(sub =>
        sub.setName('start').setDescription('Start a new giveaway')
          .addChannelOption(opt =>
            opt.setName('channel').setDescription('Channel to post the giveaway in')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          )
          .addStringOption(opt =>
            opt.setName('prize').setDescription('What is being given away').setRequired(true),
          )
          .addStringOption(opt =>
            opt.setName('duration').setDescription('How long (e.g. 1h, 2d, 1w)').setRequired(true),
          )
          .addIntegerOption(opt =>
            opt.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(50),
          )
          .addRoleOption(opt =>
            opt.setName('required_role').setDescription('Role required to enter'),
          )
          .addIntegerOption(opt =>
            opt.setName('min_account_age').setDescription('Minimum account age in days').setMinValue(1),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('end').setDescription('End a giveaway early')
          .addStringOption(opt =>
            opt.setName('message_id').setDescription('Message ID of the giveaway').setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('reroll').setDescription('Reroll winners for an ended giveaway')
          .addStringOption(opt =>
            opt.setName('message_id').setDescription('Message ID of the giveaway').setRequired(true),
          )
          .addIntegerOption(opt =>
            opt.setName('count').setDescription('Number of new winners to pick').setMinValue(1),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('list').setDescription('List active giveaways in this server'),
      )
      .addSubcommand(sub =>
        sub.setName('delete').setDescription('Delete a giveaway without picking winners')
          .addStringOption(opt =>
            opt.setName('message_id').setDescription('Message ID of the giveaway').setRequired(true),
          ),
      ),
    permission: 'giveaways.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const sub = interaction.options.getSubcommand();

      if (sub === 'start') {
        await handleStart(context, interaction, tables, messages, buildEmbed);
      } else if (sub === 'end') {
        await handleEnd(context, interaction, tables, messages);
      } else if (sub === 'reroll') {
        await handleReroll(context, interaction, tables, messages);
      } else if (sub === 'list') {
        await handleList(context, interaction, tables);
      } else if (sub === 'delete') {
        await handleDelete(context, interaction, tables);
      }
    },
  });
}

async function findGiveaway(
  db: any,
  tables: GiveawayTables,
  messageId: string,
  guildId: string,
): Promise<any | null> {
  const rows = await db.select().from(tables.giveaways).where(
    and(
      eq(tables.giveaways.messageId, messageId),
      eq(tables.giveaways.guildId, guildId),
    ),
  );
  return rows.length > 0 ? rows[0] : null;
}

function buildButton(config: ReturnType<typeof getConfig>, giveawayId: number): ActionRowBuilder<any> {
  return new ActionRowBuilder<any>().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter_${giveawayId}`)
      .setLabel(config.buttonLabel)
      .setEmoji(config.buttonEmoji)
      .setStyle(ButtonStyle.Primary),
  );
}

async function handleStart(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: GiveawayTables,
  messages: ReturnType<typeof getMessages>,
  buildEmbed: BuildEmbedFn,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const prize = interaction.options.getString('prize', true);
  const durationStr = interaction.options.getString('duration', true);
  const config = getConfig(context);
  const winnerCount = interaction.options.getInteger('winners') ?? config.defaultWinnerCount;
  const requiredRole = interaction.options.getRole('required_role');
  const minAccountAge = interaction.options.getInteger('min_account_age');

  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.reply({
      embeds: [context.embeds.error('Invalid Duration', 'Use a format like `1h`, `2d`, `1w`.')],
      ephemeral: true,
    });
    return;
  }

  const endsAt = Date.now() + durationMs;
  const db = context.db.getDb() as any;
  const requiredRoleId = requiredRole?.id ?? null;

  const embed = buildEmbed({
    prize,
    hostId: interaction.user.id,
    entries: 0,
    winnerCount,
    endsAt,
    requiredRoleId,
    minAccountAge: minAccountAge ?? null,
  });

  let sentMessage;
  try {
    sentMessage = await channel.send({ embeds: [embed], components: [buildButton(config, 0)] });
  } catch {
    await interaction.reply({
      embeds: [context.embeds.error('Failed', 'Could not send the giveaway message. Check bot permissions in that channel.')],
      ephemeral: true,
    });
    return;
  }

  const values = {
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: sentMessage.id,
    hostId: interaction.user.id,
    prize,
    winnerCount,
    requiredRoleId,
    minAccountAge: minAccountAge ?? null,
    endsAt,
    ended: 0,
  };

  let giveawayId: number;
  if (context.db.driver === 'mysql') {
    const result = await db.insert(tables.giveaways).values(values);
    giveawayId = result[0].insertId;
  } else {
    const result = await db.insert(tables.giveaways).values(values).returning({ id: tables.giveaways.id });
    giveawayId = result[0].id;
  }

  try {
    await sentMessage.edit({ components: [buildButton(config, giveawayId)] });
  } catch {
    // Non-critical
  }

  const durationFmt = formatDuration(durationMs);
  let desc = `Giveaway for **${prize}** started in ${channel}!\nDuration: **${durationFmt}** - Winners: **${winnerCount}**`;
  if (requiredRole) desc += `\nRequired role: ${requiredRole}`;
  if (minAccountAge) desc += `\nMin account age: **${minAccountAge} days**`;

  await interaction.reply({
    embeds: [context.embeds.success('Giveaway Started', desc)],
  });
}

async function handleEnd(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: GiveawayTables,
  messages: ReturnType<typeof getMessages>,
): Promise<void> {
  const messageId = interaction.options.getString('message_id', true);
  const db = context.db.getDb() as any;

  const giveaway = await findGiveaway(db, tables, messageId, interaction.guildId!);
  if (!giveaway) {
    await interaction.reply({
      embeds: [context.embeds.error('Not Found', 'No giveaway found with that message ID.')],
      ephemeral: true,
    });
    return;
  }

  if (giveaway.ended) {
    await interaction.reply({
      embeds: [context.embeds.error('Already Ended', 'This giveaway has already ended.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const entries = await db.select().from(tables.entries).where(eq(tables.entries.giveawayId, giveaway.id));
  const winners = pickRandomWinners(entries, giveaway.winnerCount);
  const winnersText = formatWinners(winners, messages);

  await db.update(tables.giveaways).set({ ended: 1 }).where(eq(tables.giveaways.id, giveaway.id));
  await editGiveawayMessage(context, giveaway, buildEndedEmbed(context, messages, giveaway, winnersText));
  await dmWinners(context, winners, giveaway, messages);

  await interaction.editReply({
    embeds: [context.embeds.success('Giveaway Ended', `Winners: ${winnersText}`)],
  });
}

async function handleReroll(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: GiveawayTables,
  messages: ReturnType<typeof getMessages>,
): Promise<void> {
  const messageId = interaction.options.getString('message_id', true);
  const count = interaction.options.getInteger('count') ?? 1;
  const db = context.db.getDb() as any;

  const giveaway = await findGiveaway(db, tables, messageId, interaction.guildId!);
  if (!giveaway) {
    await interaction.reply({
      embeds: [context.embeds.error('Not Found', 'No giveaway found with that message ID.')],
      ephemeral: true,
    });
    return;
  }

  if (!giveaway.ended) {
    await interaction.reply({
      embeds: [context.embeds.error('Still Active', 'This giveaway has not ended yet. Use `/giveaway end` first.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const entries = await db.select().from(tables.entries).where(eq(tables.entries.giveawayId, giveaway.id));
  const winners = pickRandomWinners(entries, count);
  const winnersText = formatWinners(winners, messages);

  await editGiveawayMessage(context, giveaway, buildEndedEmbed(context, messages, giveaway, winnersText));
  await dmWinners(context, winners, giveaway, messages);

  await interaction.editReply({
    embeds: [context.embeds.success('Giveaway Rerolled', `New winners: ${winnersText}`)],
  });
}

async function handleList(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: GiveawayTables,
): Promise<void> {
  const db = context.db.getDb() as any;

  const rows = await db.select().from(tables.giveaways).where(
    and(
      eq(tables.giveaways.guildId, interaction.guildId!),
      eq(tables.giveaways.ended, 0),
    ),
  );

  if (rows.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.info('Active Giveaways', 'No active giveaways in this server.')],
    });
    return;
  }

  const lines = rows.map((g: any) => {
    const endsAtSec = Math.floor(g.endsAt / 1000);
    return `**${g.prize}** in <#${g.channelId}> - Ends <t:${endsAtSec}:R> (${g.winnerCount} winner${g.winnerCount !== 1 ? 's' : ''})`;
  });

  await interaction.reply({
    embeds: [context.embeds.info('Active Giveaways', lines.join('\n'))],
  });
}

async function handleDelete(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: GiveawayTables,
): Promise<void> {
  const messageId = interaction.options.getString('message_id', true);
  const db = context.db.getDb() as any;

  const giveaway = await findGiveaway(db, tables, messageId, interaction.guildId!);
  if (!giveaway) {
    await interaction.reply({
      embeds: [context.embeds.error('Not Found', 'No giveaway found with that message ID.')],
      ephemeral: true,
    });
    return;
  }

  try {
    const channel = await context.client.channels.fetch(giveaway.channelId) as TextChannel;
    const message = await channel.messages.fetch(giveaway.messageId);
    await message.delete();
  } catch {
    // Message may already be deleted
  }

  await db.delete(tables.entries).where(eq(tables.entries.giveawayId, giveaway.id));
  await db.delete(tables.giveaways).where(eq(tables.giveaways.id, giveaway.id));

  await interaction.reply({
    embeds: [context.embeds.success('Giveaway Deleted', `Deleted giveaway for **${giveaway.prize}**.`)],
  });
}
