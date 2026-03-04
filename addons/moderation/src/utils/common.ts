import type { AddonContext, AddonConfigAccess } from '@omni/core';
import type { User, EmbedBuilder } from 'discord.js';
import type { ActionInsert, ModerationConfig } from '../index';

export const ACTION_LABELS: Record<string, string> = {
  warn: 'Warn',
  kick: 'Kick',
  ban: 'Ban',
  tempban: 'Tempban',
  unban: 'Unban',
  mute: 'Mute',
  unmute: 'Unmute',
  clearwarnings: 'Clear Warnings',
};

export interface ModerationMessages extends Record<string, string> {
  dmBanned: string;
  dmTempbanned: string;
  dmKicked: string;
  dmWarned: string;
  dmMuted: string;
  banned: string;
  tempbanned: string;
  unbanned: string;
  kicked: string;
  warned: string;
  warningsCleared: string;
  muted: string;
  unmuted: string;
  slowmodeSet: string;
  slowmodeRemoved: string;
  channelLocked: string;
  channelUnlocked: string;
  noWarnings: string;
  noHistory: string;
  emptyModLog: string;
  dmFailed: string;
}

export const MESSAGE_DEFAULTS: ModerationMessages = {
  dmBanned: 'You have been banned',
  dmTempbanned: 'You have been temporarily banned',
  dmKicked: 'You have been kicked',
  dmWarned: 'You have been warned',
  dmMuted: 'You have been muted',
  banned: '{user} has been banned.\n**Reason:** {reason}',
  tempbanned: '{user} has been banned for **{duration}**.\n**Reason:** {reason}',
  unbanned: '{user} has been unbanned.\n**Reason:** {reason}',
  kicked: '{user} has been kicked.\n**Reason:** {reason}',
  warned: '{user} has been warned.\n**Reason:** {reason}\n**Warnings:** {count}',
  warningsCleared: 'Cleared all warnings for {user}.',
  muted: '{user} has been muted for **{duration}**.\n**Reason:** {reason}',
  unmuted: '{user} has been unmuted.\n**Reason:** {reason}',
  slowmodeSet: 'Set slowmode to **{seconds}s** in {channel}.',
  slowmodeRemoved: 'Removed slowmode from {channel}.',
  channelLocked: '{channel} has been locked.',
  channelUnlocked: '{channel} has been unlocked.',
  noWarnings: '{user} has no active warnings.',
  noHistory: '{user} has no moderation history.',
  emptyModLog: 'No moderation actions have been recorded yet.',
  dmFailed: '\n*Could not DM user.*',
};

export interface Helpers {
  insertAction(values: ActionInsert): Promise<number>;
  sendModLog(guildId: string, title: string, fields: { name: string; value: string; inline?: boolean }[], color: 'warning' | 'info'): Promise<void>;
  getWarningCount(guildId: string, userId: string): Promise<number>;
}

export function getConfig(context: AddonContext): ModerationConfig {
  return context.config.getAll() as unknown as ModerationConfig;
}

export function getMessages(context: AddonContext): AddonConfigAccess<ModerationMessages> {
  return context.configs.get('messages', MESSAGE_DEFAULTS);
}

export function msg(messages: AddonConfigAccess<ModerationMessages>, key: keyof ModerationMessages, vars?: Record<string, string>): string {
  let text = messages.get(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}

export async function tryDmUser(user: User, embed: EmbedBuilder): Promise<boolean> {
  try {
    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}
