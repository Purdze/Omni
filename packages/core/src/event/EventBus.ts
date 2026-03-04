import type { Client } from 'discord.js';
import type { OmniEvents, AllEvents, EventListener, EventSubscriber } from '../types/event';
import type { AddonLogger } from '../types/addon';

interface RegisteredListener {
  event: string;
  listener: (...args: unknown[]) => void;
  once: boolean;
}

/**
 * Unifies Discord.js client events and custom Omni events into a single
 * subscription surface. Every listener is tracked per-addon so that an
 * addon's listeners can be bulk-removed on disable or reload.
 */
export class EventBus {
  private readonly client: Client;
  private readonly logger: AddonLogger;
  private readonly addonListeners = new Map<string, RegisteredListener[]>();

  /**
   * Custom Omni event listeners, managed directly rather than via Node
   * EventEmitter so we can enforce typed events and track ownership.
   */
  private readonly omniListeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(client: Client, logger: AddonLogger) {
    this.client = client;
    this.logger = logger;
  }

  on<K extends keyof AllEvents>(
    addonId: string,
    event: K,
    listener: EventListener<K>,
  ): void {
    this.addListener(addonId, event as string, listener as (...args: unknown[]) => void, false);
  }

  once<K extends keyof AllEvents>(
    addonId: string,
    event: K,
    listener: EventListener<K>,
  ): void {
    this.addListener(addonId, event as string, listener as (...args: unknown[]) => void, true);
  }

  emit<K extends keyof OmniEvents>(event: K, ...args: OmniEvents[K]): void {
    const listeners = this.omniListeners.get(event as string);
    if (!listeners || listeners.length === 0) return;

    for (const fn of [...listeners]) {
      this.safeCall(fn, event as string, args);
    }
  }

  removeAllForAddon(addonId: string): void {
    const listeners = this.addonListeners.get(addonId);
    if (!listeners) return;

    for (const reg of listeners) {
      if (this.isDiscordEvent(reg.event)) {
        this.client.removeListener(reg.event, reg.listener);
      } else {
        this.removeOmniListener(reg.event, reg.listener);
      }
    }

    this.addonListeners.delete(addonId);
    this.logger.debug(`Removed all event listeners for addon "${addonId}"`);
  }

  createSubscriber(addonId: string): EventSubscriber {
    return {
      on: <K extends keyof AllEvents>(event: K, listener: EventListener<K>) => {
        this.on(addonId, event, listener);
      },
      once: <K extends keyof AllEvents>(event: K, listener: EventListener<K>) => {
        this.once(addonId, event, listener);
      },
      emit: <K extends keyof OmniEvents>(event: K, ...args: OmniEvents[K]) => {
        this.emit(event, ...args);
      },
    };
  }

  private safeCall(fn: (...args: unknown[]) => void, event: string, args: unknown[]): void {
    try {
      const result: unknown = fn(...args);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err) => {
          this.logger.error(`Unhandled error in event listener for "${event}"`, err);
        });
      }
    } catch (err) {
      this.logger.error(`Unhandled error in event listener for "${event}"`, err);
    }
  }

  private getOrCreateList<K, V>(map: Map<K, V[]>, key: K): V[] {
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    return list;
  }

  private addListener(
    addonId: string,
    event: string,
    listener: (...args: unknown[]) => void,
    once: boolean,
  ): void {
    const wrapped = (...args: unknown[]) => {
      this.safeCall(listener, event, args);

      if (once && !this.isDiscordEvent(event)) {
        this.removeOmniListener(event, wrapped);
      }
    };

    if (this.isDiscordEvent(event)) {
      if (once) {
        this.client.once(event, wrapped);
      } else {
        this.client.on(event, wrapped);
      }
    } else {
      this.getOrCreateList(this.omniListeners, event).push(wrapped);
    }

    this.getOrCreateList(this.addonListeners, addonId).push({ event, listener: wrapped, once });
  }

  private removeOmniListener(event: string, listener: (...args: unknown[]) => void): void {
    const listeners = this.omniListeners.get(event);
    if (!listeners) return;

    const idx = listeners.indexOf(listener);
    if (idx !== -1) {
      listeners.splice(idx, 1);
    }
  }

  /**
   * Discord.js event names are camelCase without colons; Omni events always
   * contain a colon separator (e.g. "addon:loaded", "economy:balanceChanged").
   */
  private isDiscordEvent(event: string): boolean {
    return !event.includes(':');
  }
}
