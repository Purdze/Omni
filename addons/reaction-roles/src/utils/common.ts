import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { AddonContext, AddonConfigAccess } from '@omni/core';

export interface ReactionRolesConfig {
  maxRolesPerPanel: number;
  maxPanelsPerGuild: number;
  ephemeralFeedback: boolean;
}

export const CONFIG_DEFAULTS: ReactionRolesConfig = {
  maxRolesPerPanel: 20,
  maxPanelsPerGuild: 50,
  ephemeralFeedback: true,
};

export const CONFIG_SEED = `# Maximum number of role buttons per panel (Discord limit: 25)
maxRolesPerPanel: 20

# Maximum number of panels per guild
maxPanelsPerGuild: 50

# Send role toggle feedback as ephemeral (only visible to the user)
ephemeralFeedback: true
`;

export interface ReactionRolesMessages extends Record<string, string> {
  roleAdded: string;
  roleRemoved: string;
  roleFailed: string;
}

export const MESSAGE_DEFAULTS: ReactionRolesMessages = {
  roleAdded: 'Added {role} to your roles.',
  roleRemoved: 'Removed {role} from your roles.',
  roleFailed: 'Failed to assign the role. The bot may lack permissions or the role is too high.',
};

export function getConfig(context: AddonContext): ReactionRolesConfig {
  return context.config.getAll() as unknown as ReactionRolesConfig;
}

export function getMessages(context: AddonContext): AddonConfigAccess<ReactionRolesMessages> {
  return context.configs.get('messages', MESSAGE_DEFAULTS);
}

export function msg(
  messages: AddonConfigAccess<ReactionRolesMessages>,
  key: keyof ReactionRolesMessages,
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

const BUTTON_STYLES: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

export function buildPanelRows(
  panelId: number,
  entries: Array<{ roleId: string; label: string; emoji: string; style: string }>,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  for (const entry of entries) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }

    const button = new ButtonBuilder()
      .setCustomId(`rr_${panelId}_${entry.roleId}`)
      .setLabel(entry.label)
      .setStyle(BUTTON_STYLES[entry.style] ?? ButtonStyle.Primary);

    if (entry.emoji) {
      button.setEmoji(entry.emoji);
    }

    currentRow.addComponents(button);
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}
