import type { OmniCommand, CommandRegistrar } from '../types/command';
import type { AddonLogger } from '../types/addon';

export class CommandManager {
  private readonly commands = new Map<string, OmniCommand>();
  private readonly ownership = new Map<string, Set<string>>();
  private readonly logger: AddonLogger;

  constructor(logger: AddonLogger) {
    this.logger = logger;
  }

  /**
   * Register a slash command on behalf of an addon.
   *
   * @throws if a command with the same name is already registered by a
   *         *different* addon.  Re-registering the same name from the same
   *         addon silently overwrites (useful during hot-reload).
   */
  register(addonId: string, command: OmniCommand): void {
    const name = command.data.name;

    const existingOwner = this.findOwner(name);
    if (existingOwner && existingOwner !== addonId) {
      throw new Error(
        `Command "${name}" is already registered by addon "${existingOwner}". ` +
          `Addon "${addonId}" cannot register a duplicate.`,
      );
    }

    this.commands.set(name, command);

    let owned = this.ownership.get(addonId);
    if (!owned) {
      owned = new Set();
      this.ownership.set(addonId, owned);
    }
    owned.add(name);

    this.logger.debug(`Registered command "/${name}" from addon "${addonId}"`);
  }

  unregister(name: string): void {
    if (!this.commands.has(name)) {
      this.logger.warn(`Attempted to unregister unknown command "/${name}"`);
      return;
    }

    this.commands.delete(name);

    for (const [addonId, names] of this.ownership) {
      if (names.delete(name)) {
        if (names.size === 0) {
          this.ownership.delete(addonId);
        }
        this.logger.debug(`Unregistered command "/${name}" from addon "${addonId}"`);
        break;
      }
    }
  }

  unregisterAll(addonId: string): void {
    const names = this.ownership.get(addonId);
    if (!names || names.size === 0) {
      return;
    }

    for (const name of names) {
      this.commands.delete(name);
    }

    const count = names.size;
    this.ownership.delete(addonId);
    this.logger.debug(`Unregistered all ${count} command(s) from addon "${addonId}"`);
  }

  get(name: string): OmniCommand | undefined {
    return this.commands.get(name);
  }

  getAll(): OmniCommand[] {
    return Array.from(this.commands.values());
  }

  getAllNames(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Create a scoped {@link CommandRegistrar} for a specific addon.
   *
   * The registrar is the interface addons receive via their context; it
   * delegates to this manager while automatically tagging each registration
   * with the owning addon ID.
   */
  createRegistrar(addonId: string): CommandRegistrar {
    return {
      register: (command: OmniCommand) => this.register(addonId, command),
      unregister: (name: string) => this.unregister(name),
    };
  }

  findOwner(name: string): string | undefined {
    for (const [addonId, names] of this.ownership) {
      if (names.has(name)) {
        return addonId;
      }
    }
    return undefined;
  }
}
