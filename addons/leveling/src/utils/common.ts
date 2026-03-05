import type { AddonContext, AddonConfigAccess } from '@omni/core';

export interface LevelingConfig {
  xpMin: number;
  xpMax: number;
  xpCooldown: number;
  levelUpMessage: boolean;
  levelUpChannelId: string;
  stackRoles: boolean;
}

export const CONFIG_DEFAULTS: LevelingConfig = {
  xpMin: 15,
  xpMax: 25,
  xpCooldown: 60,
  levelUpMessage: true,
  levelUpChannelId: '',
  stackRoles: true,
};

export const CONFIG_SEED = `# Minimum XP earned per message
xpMin: 15

# Maximum XP earned per message
xpMax: 25

# Cooldown in seconds between XP grants (prevents spam)
xpCooldown: 60

# Send a message when a user levels up
levelUpMessage: true

# Channel ID to send level-up messages to (leave empty for same channel)
levelUpChannelId: ""

# true = keep all earned reward roles; false = only keep the highest
stackRoles: true
`;

export interface LevelingMessages extends Record<string, string> {
  levelUp: string;
  roleReward: string;
  noData: string;
}

export const MESSAGE_DEFAULTS: LevelingMessages = {
  levelUp: '{user} reached **Level {level}**!',
  roleReward: '{user} earned the {role} role for reaching Level {level}!',
  noData: 'No leveling data found.',
};

export function getConfig(context: AddonContext): LevelingConfig {
  return context.config.getAll() as unknown as LevelingConfig;
}

export function getMessages(context: AddonContext): AddonConfigAccess<LevelingMessages> {
  return context.configs.get('messages', MESSAGE_DEFAULTS);
}

export function msg(
  messages: AddonConfigAccess<LevelingMessages>,
  key: keyof LevelingMessages,
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

export function computeLevel(xp: number): number {
  return Math.floor(0.1 * Math.sqrt(xp));
}

export function xpForLevel(level: number): number {
  return level * level * 100;
}

export function xpToNextLevel(xp: number): number {
  const currentLevel = computeLevel(xp);
  return xpForLevel(currentLevel + 1) - xp;
}

export function levelProgress(xp: number): number {
  const currentLevel = computeLevel(xp);
  const currentLevelXp = xpForLevel(currentLevel);
  const nextLevelXp = xpForLevel(currentLevel + 1);
  const range = nextLevelXp - currentLevelXp;
  if (range === 0) return 0;
  return (xp - currentLevelXp) / range;
}

export function progressBar(fraction: number, length: number = 10): string {
  const filled = Math.round(fraction * length);
  const empty = length - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}
