import * as fs from 'fs';
import * as path from 'path';
import type { AddonConfigAccess } from '../types/config';
import type { AddonLogger } from '../types/addon';

/**
 * Deep-merges saved addon config on top of addon-supplied defaults so that
 * new keys introduced in addon updates are automatically available while
 * user customisations are preserved.
 */
export class AddonConfigManager {
  private readonly configDir: string;
  private readonly logger: AddonLogger;

  constructor(configDir: string, logger: AddonLogger) {
    this.configDir = configDir;
    this.logger = logger;
  }

  createAccess<T extends Record<string, unknown>>(
    addonId: string,
    defaults: T,
  ): AddonConfigAccess<T> {
    let config = this.load(addonId, defaults);
    const configPath = this.getConfigPath(addonId);

    const access: AddonConfigAccess<T> = {
      getAll: (): T => {
        return { ...config };
      },

      get: <K extends keyof T>(key: K): T[K] => {
        return config[key];
      },

      set: <K extends keyof T>(key: K, value: T[K]): void => {
        config[key] = value;
        this.persist(configPath, config);
      },

      reset: (): void => {
        config = this.deepClone(defaults);
        this.persist(configPath, config);
        this.logger.info(`Config for addon "${addonId}" reset to defaults`);
      },
    };

    return access;
  }

  private load<T extends Record<string, unknown>>(
    addonId: string,
    defaults: T,
  ): T {
    const configPath = this.getConfigPath(addonId);

    fs.mkdirSync(this.configDir, { recursive: true });

    if (!fs.existsSync(configPath)) {
      this.persist(configPath, defaults);
      this.logger.debug(
        `Created default config for addon "${addonId}" at ${configPath}`,
      );
      return this.deepClone(defaults);
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw) as Record<string, unknown>;

      const merged = this.deepMerge(
        this.deepClone(defaults) as Record<string, unknown>,
        saved,
      ) as T;

      this.persist(configPath, merged);

      return merged;
    } catch (error) {
      this.logger.warn(
        `Failed to parse config for addon "${addonId}" at ${configPath}. ` +
          `Falling back to defaults.`,
        error as Error,
      );
      this.persist(configPath, defaults);
      return this.deepClone(defaults);
    }
  }

  private getConfigPath(addonId: string): string {
    return path.join(this.configDir, `${addonId}.json`);
  }

  private persist(filePath: string, data: Record<string, unknown>): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to write config to ${filePath}`, error as Error);
    }
  }

  /**
   * Primitive values in `source` overwrite `target`. Nested objects are
   * recursively merged. Arrays in `source` fully replace arrays in `target`.
   * Modifies and returns `target`.
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    for (const key of Object.keys(source)) {
      const srcVal = source[key];
      const tgtVal = target[key];

      if (
        this.isPlainObject(srcVal) &&
        this.isPlainObject(tgtVal)
      ) {
        target[key] = this.deepMerge(
          tgtVal as Record<string, unknown>,
          srcVal as Record<string, unknown>,
        );
      } else {
        target[key] = srcVal;
      }
    }

    return target;
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }
}
