import type { AddonContext, AddonConfigAccess } from '@omni/core';

export interface WelcomeConfig {
  welcomeChannelId: string;
  leaveChannelId: string;
  autoRoleIds: string[];
  memberCountChannelId: string;
  memberCountFormat: string;
  dmOnJoin: boolean;
}

export const CONFIG_DEFAULTS: WelcomeConfig = {
  welcomeChannelId: '',
  leaveChannelId: '',
  autoRoleIds: [],
  memberCountChannelId: '',
  memberCountFormat: 'Members: {count}',
  dmOnJoin: false,
};

export const CONFIG_SEED = `# Channel ID to send welcome messages to (leave empty to disable)
welcomeChannelId: ""

# Channel ID to send leave messages to (leave empty to disable)
leaveChannelId: ""

# Role IDs to automatically assign to new members
autoRoleIds: []

# Voice channel ID to display member count in (leave empty to disable)
memberCountChannelId: ""

# Format for the member count channel name - {count} is replaced with the number
memberCountFormat: "Members: {count}"

# Send a DM to new members when they join
dmOnJoin: false
`;

export interface WelcomeMessages extends Record<string, string> {
  welcomeTitle: string;
  welcomeBody: string;
  leaveTitle: string;
  leaveBody: string;
  dmWelcome: string;
}

export const MESSAGE_DEFAULTS: WelcomeMessages = {
  welcomeTitle: 'Welcome!',
  welcomeBody: 'Hey {user}, welcome to **{server}**! You are member #{count}.',
  leaveTitle: 'Goodbye!',
  leaveBody: '{tag} has left the server.',
  dmWelcome: 'Welcome to **{server}**! Enjoy your stay.',
};

export function getConfig(context: AddonContext): WelcomeConfig {
  return context.config.getAll() as unknown as WelcomeConfig;
}

export function getMessages(context: AddonContext): AddonConfigAccess<WelcomeMessages> {
  return context.configs.get('messages', MESSAGE_DEFAULTS);
}

export function msg(messages: AddonConfigAccess<WelcomeMessages>, key: keyof WelcomeMessages, vars?: Record<string, string>): string {
  let text = messages.get(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
