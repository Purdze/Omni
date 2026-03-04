import type { Addon, AddonManifest, AddonState } from '../types/addon';
import type { AddonLogger } from '../types/addon';

export interface AddonEntry {
  manifest: AddonManifest;
  instance: Addon;
  state: AddonState;
  outDir: string;
  sourceDir: string;
}

export class AddonRegistry {
  private readonly entries = new Map<string, AddonEntry>();
  private readonly apis = new Map<string, Record<string, unknown>>();
  private readonly logger: AddonLogger;

  constructor(logger: AddonLogger) {
    this.logger = logger;
  }

  register(entry: AddonEntry): void {
    this.entries.set(entry.manifest.id, entry);
  }

  get(addonId: string): AddonEntry | undefined {
    return this.entries.get(addonId);
  }

  getAll(): AddonEntry[] {
    return Array.from(this.entries.values());
  }

  has(addonId: string): boolean {
    return this.entries.has(addonId);
  }

  remove(addonId: string): void {
    this.entries.delete(addonId);
    this.apis.delete(addonId);
  }

  setState(addonId: string, state: AddonState): void {
    const entry = this.entries.get(addonId);
    if (entry) {
      entry.state = state;
    }
  }

  exposeAPI(addonId: string, api: Record<string, unknown>): void {
    this.apis.set(addonId, api);
    this.logger.debug(`Addon "${addonId}" exposed an inter-addon API`);
  }

  getAPI<T>(addonId: string): T | undefined {
    return this.apis.get(addonId) as T | undefined;
  }

  isEnabled(addonId: string): boolean {
    const entry = this.entries.get(addonId);
    return entry?.state === 'ENABLED';
  }
}
