import type { AddonContext, AddonConfigAccess } from '@omni/core';

export interface TempChannelConfig {
  channelNameTemplate: string;
  userLimit: number;
}

export const CONFIG_DEFAULTS: TempChannelConfig = {
  channelNameTemplate: "{username}'s Channel",
  userLimit: 0,
};

export const CONFIG_SEED = `# Name template for created channels - {username} is replaced with the user's display name
channelNameTemplate: "{username}'s Channel"

# Default user limit for created channels (0 = unlimited)
userLimit: 0
`;

export interface TempChannelMessages extends Record<string, string> {
  hubAdded: string;
  hubRemoved: string;
  hubAlreadySet: string;
  hubNotFound: string;
  noHubs: string;
}

export const MESSAGE_DEFAULTS: TempChannelMessages = {
  hubAdded: 'Set {channel} as a temp channel hub.',
  hubRemoved: 'Removed {channel} as a temp channel hub.',
  hubAlreadySet: '{channel} is already a hub.',
  hubNotFound: '{channel} is not a hub.',
  noHubs: 'No temp channel hubs configured.',
};

export function getConfig(context: AddonContext): TempChannelConfig {
  return context.config.getAll() as unknown as TempChannelConfig;
}

export function getMessages(context: AddonContext): AddonConfigAccess<TempChannelMessages> {
  return context.configs.get('messages', MESSAGE_DEFAULTS);
}

export function msg(messages: AddonConfigAccess<TempChannelMessages>, key: keyof TempChannelMessages, vars?: Record<string, string>): string {
  let text = messages.get(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
