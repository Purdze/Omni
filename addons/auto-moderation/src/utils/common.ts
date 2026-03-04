import type { AddonContext, AddonConfigAccess } from '@omni/core';

export interface AutoModConfig {
  wordFilterEnabled: boolean;
  wordFilterDelete: boolean;
  spamEnabled: boolean;
  spamMaxMessages: number;
  spamMessageWindow: number;
  spamMaxDuplicates: number;
  spamDuplicateWindow: number;
  spamMaxMentions: number;
  spamDeleteMessage: boolean;
  linkFilterEnabled: boolean;
  linkFilterDelete: boolean;
  linkAllowImages: boolean;
  raidEnabled: boolean;
  raidJoinThreshold: number;
  raidJoinWindow: number;
  raidAction: string;
  raidAlertChannelId: string;
  logChannelId: string;
  exemptRoles: string[];
  exemptChannels: string[];
  punishments: PunishmentStep[];
}

export interface PunishmentStep {
  threshold: number;
  action: 'warn' | 'mute' | 'kick' | 'ban';
  duration?: string;
}

export const CONFIG_DEFAULTS: AutoModConfig = {
  wordFilterEnabled: true,
  wordFilterDelete: true,
  spamEnabled: true,
  spamMaxMessages: 5,
  spamMessageWindow: 5,
  spamMaxDuplicates: 3,
  spamDuplicateWindow: 30,
  spamMaxMentions: 5,
  spamDeleteMessage: true,
  linkFilterEnabled: false,
  linkFilterDelete: true,
  linkAllowImages: true,
  raidEnabled: false,
  raidJoinThreshold: 10,
  raidJoinWindow: 10,
  raidAction: 'lockdown',
  raidAlertChannelId: '',
  logChannelId: '',
  exemptRoles: [],
  exemptChannels: [],
  punishments: [
    { threshold: 1, action: 'warn' },
    { threshold: 3, action: 'mute', duration: '5m' },
    { threshold: 5, action: 'mute', duration: '1h' },
    { threshold: 10, action: 'ban' },
  ],
};

export const CONFIG_SEED = `# Enable word/regex filtering
wordFilterEnabled: true

# Delete messages that trigger the word filter
wordFilterDelete: true

# Enable spam detection (fast messages + duplicates)
spamEnabled: true

# Max messages in the spam window before triggering
spamMaxMessages: 5

# Time window for message spam detection (seconds)
spamMessageWindow: 5

# Max duplicate messages before triggering
spamMaxDuplicates: 3

# Time window for duplicate message detection (seconds)
spamDuplicateWindow: 30

# Max mentions in a single message before triggering
spamMaxMentions: 5

# Delete messages that trigger spam detection
spamDeleteMessage: true

# Enable link filtering
linkFilterEnabled: false

# Delete messages that contain blocked links
linkFilterDelete: true

# Allow image links (png, jpg, gif, webp) even when link filter is on
linkAllowImages: true

# Enable anti-raid protection
raidEnabled: false

# Number of joins within the window to trigger raid detection
raidJoinThreshold: 10

# Time window for raid detection (seconds)
raidJoinWindow: 10

# Raid action: "lockdown" sets verification to VERY_HIGH, "alert" sends warning
raidAction: "lockdown"

# Channel ID to send raid alerts to (required for "alert" action)
raidAlertChannelId: ""

# Channel ID to send auto-mod log messages to (leave empty to disable)
logChannelId: ""

# Roles exempt from auto-moderation (role IDs)
exemptRoles: []

# Channels exempt from auto-moderation (channel IDs)
exemptChannels: []

# Escalating punishments based on violation count
punishments:
  - threshold: 1
    action: "warn"
  - threshold: 3
    action: "mute"
    duration: "5m"
  - threshold: 5
    action: "mute"
    duration: "1h"
  - threshold: 10
    action: "ban"
`;

export interface AutoModMessages extends Record<string, string> {
  wordFilterTriggered: string;
  spamDetected: string;
  linkBlocked: string;
  mentionSpam: string;
  raidDetected: string;
  punishmentWarn: string;
  punishmentMute: string;
  punishmentKick: string;
  punishmentBan: string;
}

export const MESSAGE_DEFAULTS: AutoModMessages = {
  wordFilterTriggered: 'Your message was removed for containing a blocked word.',
  spamDetected: 'Your message was removed for spamming.',
  linkBlocked: 'Your message was removed for containing a blocked link.',
  mentionSpam: 'Your message was removed for excessive mentions.',
  raidDetected: 'Raid detected - {action} activated.',
  punishmentWarn: 'You have been warned for: {reason} (Warning #{count})',
  punishmentMute: 'You have been muted for {duration} for: {reason}',
  punishmentKick: 'You have been kicked for: {reason}',
  punishmentBan: 'You have been banned for: {reason}',
};

export function getConfig(context: AddonContext): AutoModConfig {
  return context.config.getAll() as unknown as AutoModConfig;
}

export function getMessages(context: AddonContext): AddonConfigAccess<AutoModMessages> {
  return context.configs.get('messages', MESSAGE_DEFAULTS);
}

export function msg(
  messages: AddonConfigAccess<AutoModMessages>,
  key: keyof AutoModMessages,
  vars?: Record<string, string>,
): string {
  let text = messages.get(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}

export function findPunishment(steps: PunishmentStep[], violationCount: number): PunishmentStep | null {
  let best: PunishmentStep | null = null;
  for (const step of steps) {
    if (step.threshold <= violationCount) {
      if (!best || step.threshold > best.threshold) {
        best = step;
      }
    }
  }
  return best;
}
