import type { AddonContext, AddonConfigAccess } from '@omni/core';
import type { TextChannel } from 'discord.js';

export interface GiveawayConfig {
  defaultWinnerCount: number;
  buttonEmoji: string;
  buttonLabel: string;
  checkInterval: number;
}

export const CONFIG_DEFAULTS: GiveawayConfig = {
  defaultWinnerCount: 1,
  buttonEmoji: '\u{1F389}',
  buttonLabel: 'Enter Giveaway',
  checkInterval: 15,
};

export const CONFIG_SEED = `# Default number of winners for new giveaways
defaultWinnerCount: 1

# Emoji shown on the enter button
buttonEmoji: "\u{1F389}"

# Label shown on the enter button
buttonLabel: Enter Giveaway

# How often (in seconds) to check for ended giveaways
checkInterval: 15
`;

export interface GiveawayMessages extends Record<string, string> {
  giveawayTitle: string;
  giveawayDescription: string;
  giveawayEndedTitle: string;
  giveawayEndedDescription: string;
  noWinner: string;
  dmWin: string;
  alreadyEntered: string;
  entryConfirmed: string;
  requirementNotMet: string;
}

export const MESSAGE_DEFAULTS: GiveawayMessages = {
  giveawayTitle: '\u{1F389} Giveaway',
  giveawayDescription: '**{prize}**\n\nReact to enter!\nEnds: <t:{endsAtUnix}:R>\nHosted by: {host}\nEntries: **{entries}**\nWinners: **{winnerCount}**',
  giveawayEndedTitle: '\u{1F389} Giveaway Ended',
  giveawayEndedDescription: '**{prize}**\n\n**Winners:** {winners}\nHosted by: {host}',
  noWinner: 'Could not determine a winner.',
  dmWin: 'Congratulations! You won **{prize}** in **{server}**!',
  alreadyEntered: 'You have already entered this giveaway.',
  entryConfirmed: 'You have entered the giveaway for **{prize}**!',
  requirementNotMet: 'You do not meet the requirements to enter this giveaway.',
};

export function getConfig(context: AddonContext): GiveawayConfig {
  return context.config.getAll() as unknown as GiveawayConfig;
}

export function getMessages(context: AddonContext): AddonConfigAccess<GiveawayMessages> {
  return context.configs.get('messages', MESSAGE_DEFAULTS);
}

export function msg(messages: AddonConfigAccess<GiveawayMessages>, key: keyof GiveawayMessages, vars?: Record<string, string>): string {
  let text = messages.get(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}

export function pickRandomWinners(entries: any[], count: number): any[] {
  if (entries.length === 0) return [];
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function formatWinners(
  winners: any[],
  messages: AddonConfigAccess<GiveawayMessages>,
): string {
  return winners.length > 0
    ? winners.map((e: any) => `<@${e.userId}>`).join(', ')
    : msg(messages, 'noWinner');
}

export function buildEndedEmbed(
  context: AddonContext,
  messages: AddonConfigAccess<GiveawayMessages>,
  giveaway: any,
  winnersText: string,
): any {
  return context.embeds.info(
    msg(messages, 'giveawayEndedTitle'),
    msg(messages, 'giveawayEndedDescription', {
      prize: giveaway.prize,
      winners: winnersText,
      host: `<@${giveaway.hostId}>`,
    }),
  );
}

export async function editGiveawayMessage(
  context: AddonContext,
  giveaway: any,
  embed: any,
): Promise<void> {
  try {
    const channel = await context.client.channels.fetch(giveaway.channelId) as TextChannel;
    const message = await channel.messages.fetch(giveaway.messageId);
    await message.edit({ embeds: [embed], components: [] });
  } catch {
    // Message may have been deleted
  }
}

export async function dmWinners(
  context: AddonContext,
  winners: any[],
  giveaway: any,
  messages: AddonConfigAccess<GiveawayMessages>,
): Promise<void> {
  for (const winner of winners) {
    try {
      const user = await context.client.users.fetch(winner.userId);
      const guild = await context.client.guilds.fetch(giveaway.guildId);
      await user.send({
        embeds: [context.embeds.success(
          '\u{1F389} You Won!',
          msg(messages, 'dmWin', { prize: giveaway.prize, server: guild.name }),
        )],
      });
    } catch {
      // DMs may be disabled
    }
  }
}
