import * as path from 'path';
import type { Client } from 'discord.js';
import { Addon, type AddonLogger } from '../types/addon';
import { AddonRegistry, type AddonEntry } from './AddonRegistry';
import { AddonLoader } from './AddonLoader';
import { AddonCompiler } from './AddonCompiler';
import { createAddonContext } from './AddonContext';
import { Logger } from '../logger/Logger';
import { EventBus } from '../event/EventBus';
import { CommandManager } from '../command/CommandManager';
import { CommandDeployer } from '../command/CommandDeployer';
import { PermissionManager } from '../permission/PermissionManager';
import { AddonConfigManager } from '../config/AddonConfigManager';
import { AddonDatabase } from '../database/AddonDatabase';
import { DatabaseManager } from '../database/DatabaseManager';
import { EmbedFactory } from '../embed/EmbedFactory';
import { ModuleManager } from '../module/ModuleManager';

interface AddonManagerDeps {
  client: Client;
  logger: Logger;
  eventBus: EventBus;
  commandManager: CommandManager;
  commandDeployer: CommandDeployer;
  permissionManager: PermissionManager;
  addonConfigManager: AddonConfigManager;
  addonDatabase: AddonDatabase;
  databaseManager: DatabaseManager;
  embedFactory: EmbedFactory;
  moduleManager: ModuleManager;
  projectRoot: string;
  token: string;
  clientId: string;
  devGuildId?: string;
}

export class AddonManager {
  private readonly deps: AddonManagerDeps;
  private readonly registry: AddonRegistry;
  private readonly loader: AddonLoader;
  private readonly compiler: AddonCompiler;
  private readonly log: AddonLogger;

  constructor(deps: AddonManagerDeps) {
    this.deps = deps;
    this.log = deps.logger.createLogger('AddonManager');
    this.registry = new AddonRegistry(this.log);
    this.loader = new AddonLoader(
      path.join(deps.projectRoot, 'addons'),
      this.log,
    );
    this.compiler = new AddonCompiler(deps.projectRoot, this.log);
  }

  getRegistry(): AddonRegistry {
    return this.registry;
  }

  /**
   * Full startup sequence: discover -> compile -> load -> enable -> deploy commands.
   */
  async startAll(): Promise<void> {
    const discovered = this.loader.discover();
    if (discovered.length === 0) {
      this.log.info('No addons found');
      return;
    }

    this.log.info(`Loading ${discovered.length} addon(s)...`);

    for (const { manifest, sourceDir } of discovered) {
      try {
        const outDir = await this.compiler.compile(manifest.id, sourceDir);
        this.registry.register({
          manifest,
          instance: null as unknown as Addon,
          state: 'COMPILED',
          outDir,
          sourceDir,
        });
        this.registry.setState(manifest.id, 'COMPILED');
      } catch (error) {
        this.failAddon(manifest.id, error as Error, `Failed to compile addon "${manifest.id}"`);
        this.registry.register({
          manifest,
          instance: null as unknown as Addon,
          state: 'FAILED',
          outDir: '',
          sourceDir,
        });
      }
    }

    for (const entry of this.registry.getAll()) {
      if (entry.state !== 'COMPILED') continue;
      await this.loadAddon(entry);
    }

    for (const entry of this.registry.getAll()) {
      if (entry.state !== 'LOADED') continue;
      await this.enableAddon(entry.manifest.id);
    }

    const enabled = this.registry.getAll().filter(a => a.state === 'ENABLED');
    const failed = this.registry.getAll().filter(a => a.state === 'FAILED');
    const names = enabled.map(a => a.manifest.name).join(', ');

    if (failed.length > 0) {
      this.log.info(`${enabled.length} addon(s) ready (${names}), ${failed.length} failed`);
    } else {
      this.log.info(`${enabled.length} addon(s) ready (${names})`);
    }

    await this.deployCommands();
  }

  private async loadAddon(entry: AddonEntry): Promise<void> {
    const { manifest } = entry;

    try {
      const mainFile = manifest.main.replace(/\.ts$/, '.js');
      const modulePath = path.resolve(entry.outDir, mainFile);

      delete require.cache[require.resolve(modulePath)];

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(modulePath);
      const AddonClass = mod.default || mod;

      if (!AddonClass || typeof AddonClass !== 'function') {
        throw new Error(
          `Addon "${manifest.id}" does not export a valid class from "${manifest.main}"`,
        );
      }

      const instance = new AddonClass();
      if (!(instance instanceof Addon)) {
        throw new Error(
          `Addon "${manifest.id}" must export a class that extends Addon`,
        );
      }

      const addonLogger = this.deps.logger.createLogger(manifest.name);
      const addonConfig = this.deps.addonConfigManager.createAccess(manifest.id, {});
      const addonConfigs = this.deps.addonConfigManager.createNamedAccess(manifest.id);
      const addonDb = this.deps.addonDatabase.createAccess(
        manifest.id,
        this.deps.databaseManager.getDb(),
        this.deps.databaseManager.driver,
      );

      const context = createAddonContext({
        addonId: manifest.id,
        logger: addonLogger,
        db: addonDb,
        config: addonConfig,
        configs: addonConfigs,
        commands: this.deps.commandManager.createRegistrar(manifest.id),
        events: this.deps.eventBus.createSubscriber(manifest.id),
        permissions: this.deps.permissionManager.createAccessor(manifest.id),
        registry: this.registry,
        moduleManager: this.deps.moduleManager,
        client: this.deps.client,
        embeds: this.deps.embedFactory,
      });

      instance.context = context;

      if (manifest.permissions) {
        for (const perm of manifest.permissions) {
          this.deps.permissionManager.define(perm);
        }
      }

      await instance.onLoad();

      entry.instance = instance;
      this.registry.setState(manifest.id, 'LOADED');
      this.deps.eventBus.emit('addon:loaded', manifest.id);
      this.log.debug(`Loaded addon: ${manifest.name} v${manifest.version}`);
    } catch (error) {
      this.failAddon(manifest.id, error as Error, `Failed to load addon "${manifest.id}"`);
    }
  }

  async enableAddon(addonId: string): Promise<void> {
    const entry = this.registry.get(addonId);
    if (!entry || entry.state !== 'LOADED') return;

    try {
      await entry.instance.onEnable();
      this.registry.setState(addonId, 'ENABLED');
      this.deps.eventBus.emit('addon:enabled', addonId);
      this.log.debug(`Enabled addon: ${entry.manifest.name}`);
    } catch (error) {
      this.failAddon(addonId, error as Error, `Failed to enable addon "${addonId}"`);
    }
  }

  async disableAddon(addonId: string): Promise<void> {
    const entry = this.registry.get(addonId);
    if (!entry || entry.state !== 'ENABLED') return;

    try {
      await entry.instance.onDisable();
    } catch (error) {
      this.log.error(`Error during onDisable for "${addonId}"`, error as Error);
    }

    this.deps.eventBus.removeAllForAddon(addonId);
    this.deps.commandManager.unregisterAll(addonId);
    this.deps.permissionManager.removeAllForAddon(addonId);

    this.registry.setState(addonId, 'DISABLED');
    this.deps.eventBus.emit('addon:disabled', addonId);
    this.log.info(`Disabled addon: ${entry.manifest.name}`);
  }

  /**
   * Hot reload: disable -> recompile -> load -> enable -> redeploy commands.
   */
  async reloadAddon(addonId: string): Promise<void> {
    const entry = this.registry.get(addonId);
    if (!entry) {
      this.log.warn(`Cannot reload unknown addon "${addonId}"`);
      return;
    }

    this.log.info(`Reloading addon: ${entry.manifest.name}...`);

    if (entry.state === 'ENABLED') {
      await this.disableAddon(addonId);
    }

    try {
      const outDir = await this.compiler.compile(entry.manifest.id, entry.sourceDir);
      entry.outDir = outDir;
      this.registry.setState(addonId, 'COMPILED');
    } catch (error) {
      this.failAddon(addonId, error as Error, `Failed to recompile addon "${addonId}"`);
      return;
    }

    await this.loadAddon(entry);
    if (entry.state !== 'LOADED') return;

    await this.enableAddon(addonId);
    await this.deployCommands();

    this.log.info(`Addon "${entry.manifest.name}" reloaded successfully`);
  }

  async disableAll(): Promise<void> {
    const addons = this.registry.getAll().filter((a) => a.state === 'ENABLED');
    for (const addon of addons.reverse()) {
      await this.disableAddon(addon.manifest.id);
    }
  }

  private failAddon(addonId: string, error: Error, message: string): void {
    this.log.error(message, error);
    this.registry.setState(addonId, 'FAILED');
    this.deps.eventBus.emit('addon:error', addonId, error);
  }

  private async deployCommands(): Promise<void> {
    const commands = this.deps.commandManager.getAll();
    if (commands.length === 0) {
      this.log.debug('No commands to deploy');
      return;
    }

    await this.deps.commandDeployer.deploy(
      commands,
      this.deps.clientId,
      this.deps.token,
      this.deps.devGuildId,
    );
  }
}
