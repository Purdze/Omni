import type { ClientEvents } from 'discord.js';

/**
 * Custom events emitted by Omni core and addons.
 * Addons extend this interface via module augmentation:
 *
 * declare module '@omni/core' {
 *   interface OmniEvents {
 *     'economy:balanceChanged': [userId: string, guildId: string, oldBalance: number, newBalance: number];
 *   }
 * }
 */
export interface OmniEvents {
  'addon:loaded': [addonId: string];
  'addon:enabled': [addonId: string];
  'addon:disabled': [addonId: string];
  'addon:error': [addonId: string, error: Error];
}

export type AllEvents = ClientEvents & OmniEvents;

export type EventListener<K extends keyof AllEvents> = (...args: AllEvents[K]) => void | Promise<void>;

export interface EventSubscriber {
  on<K extends keyof AllEvents>(event: K, listener: EventListener<K>): void;
  once<K extends keyof AllEvents>(event: K, listener: EventListener<K>): void;
  emit<K extends keyof OmniEvents>(event: K, ...args: OmniEvents[K]): void;
}
