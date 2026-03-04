import * as fs from 'fs';
import * as path from 'path';
import type { AddonManifest } from '../types/addon';
import type { AddonLogger } from '../types/addon';

/**
 * Discovers addons from the `addons/` directory and returns them in
 * dependency-sorted order.
 */
export class AddonLoader {
  private readonly addonsDir: string;
  private readonly logger: AddonLogger;

  constructor(addonsDir: string, logger: AddonLogger) {
    this.addonsDir = addonsDir;
    this.logger = logger;
  }

  discover(): Array<{ manifest: AddonManifest; sourceDir: string }> {
    if (!fs.existsSync(this.addonsDir)) {
      this.logger.info('Addons directory does not exist, creating it');
      fs.mkdirSync(this.addonsDir, { recursive: true });
      return [];
    }

    const entries = fs.readdirSync(this.addonsDir, { withFileTypes: true });
    const discovered: Array<{ manifest: AddonManifest; sourceDir: string }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const addonDir = path.join(this.addonsDir, entry.name);
      const manifestPath = path.join(addonDir, 'addon.manifest.json');

      if (!fs.existsSync(manifestPath)) {
        this.logger.debug(`Skipping ${entry.name}: no addon.manifest.json`);
        continue;
      }

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw) as AddonManifest;

        if (!manifest.id || !manifest.name || !manifest.main) {
          this.logger.warn(
            `Invalid manifest in ${entry.name}: missing required fields (id, name, main)`,
          );
          continue;
        }

        discovered.push({ manifest, sourceDir: addonDir });
        this.logger.debug(`Discovered addon: ${manifest.name} (${manifest.id} v${manifest.version})`);
      } catch (error) {
        this.logger.error(`Failed to read manifest for ${entry.name}`, error as Error);
      }
    }

    return this.topologicalSort(discovered);
  }

  /** @throws on circular dependencies. */
  private topologicalSort(
    addons: Array<{ manifest: AddonManifest; sourceDir: string }>,
  ): Array<{ manifest: AddonManifest; sourceDir: string }> {
    const addonMap = new Map(addons.map((a) => [a.manifest.id, a]));
    const sorted: Array<{ manifest: AddonManifest; sourceDir: string }> = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected involving addon "${id}"`);
      }

      visiting.add(id);

      const addon = addonMap.get(id);
      if (addon) {
        const deps = addon.manifest.dependencies ?? [];
        for (const dep of deps) {
          if (!addonMap.has(dep)) {
            this.logger.warn(
              `Addon "${id}" depends on "${dep}" which is not installed`,
            );
            continue;
          }
          visit(dep);
        }
        sorted.push(addon);
      }

      visiting.delete(id);
      visited.add(id);
    };

    for (const addon of addons) {
      visit(addon.manifest.id);
    }

    return sorted;
  }
}
