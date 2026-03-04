import type { Client } from 'discord.js';
import type { CommandRegistrar } from './command';
import type { AddonConfigAccess } from './config';
import type { AddonDatabaseAccess } from './database';
import type { EventSubscriber } from './event';
import type { PermissionAccessor, PermissionDefinition } from './permission';
import type { ADDON_STATES } from '../database/schema';

export type AddonState = (typeof ADDON_STATES)[number];

export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  dependencies?: string[];
  permissions?: PermissionDefinition[];
}

export interface AddonContext {
  logger: AddonLogger;
  db: AddonDatabaseAccess;
  config: AddonConfigAccess;
  commands: CommandRegistrar;
  events: EventSubscriber;
  permissions: PermissionAccessor;
  addons: InterAddonAPI;
  client: Client;
  embeds: EmbedFactoryAccess;
}

export interface AddonLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface InterAddonAPI {
  expose<T extends Record<string, unknown>>(api: T): void;
  getAPI<T>(addonId: string): T | undefined;
  isEnabled(addonId: string): boolean;
}

export interface EmbedFactoryAccess {
  info(title: string, description: string): import('discord.js').EmbedBuilder;
  success(title: string, description: string): import('discord.js').EmbedBuilder;
  warning(title: string, description: string): import('discord.js').EmbedBuilder;
  error(title: string, description: string): import('discord.js').EmbedBuilder;
}

export abstract class Addon {
  /** Injected by the core after instantiation */
  public context!: AddonContext;

  abstract onLoad(): Promise<void> | void;
  abstract onEnable(): Promise<void> | void;
  onDisable(): Promise<void> | void {}
}
