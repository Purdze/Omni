import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import type { AddonConfigAccess, NamedConfigAccess } from '../types/config';
import type { AddonLogger } from '../types/addon';

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
    return this.buildAccess(addonId, 'config', defaults);
  }

  createNamedAccess(addonId: string): NamedConfigAccess {
    return {
      get: <T extends Record<string, unknown>>(name: string, defaults: T, seedYaml?: string): AddonConfigAccess<T> => {
        return this.buildAccess(addonId, name, defaults, seedYaml);
      },
    };
  }

  private buildAccess<T extends Record<string, unknown>>(
    addonId: string,
    name: string,
    defaults: T,
    seedYaml?: string,
  ): AddonConfigAccess<T> {
    const filePath = this.getConfigPath(addonId, name);
    let config = this.load(addonId, name, filePath, defaults, seedYaml);

    return {
      getAll: (): T => ({ ...config }),
      get: <K extends keyof T>(key: K): T[K] => config[key],
      set: <K extends keyof T>(key: K, value: T[K]): void => {
        config[key] = value;
        this.persist(filePath, config);
      },
      reset: (): void => {
        config = this.deepClone(defaults);
        this.persist(filePath, config);
        this.logger.info(`Config "${name}" for addon "${addonId}" reset to defaults`);
      },
      seed: (yaml: string): void => {
        if (Object.keys(config).length === 0) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, yaml, 'utf-8');
          config = YAML.parse(yaml) as T;
        }
      },
    };
  }

  private load<T extends Record<string, unknown>>(
    addonId: string,
    name: string,
    filePath: string,
    defaults: T,
    seedYaml?: string,
  ): T {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
      if (seedYaml) {
        fs.writeFileSync(filePath, seedYaml, 'utf-8');
        this.logger.debug(`Created config "${name}" for addon "${addonId}" from seed`);
        const parsed = YAML.parse(seedYaml) as Record<string, unknown>;
        return this.deepMerge(this.deepClone(defaults) as Record<string, unknown>, parsed) as T;
      }
      this.persist(filePath, defaults);
      this.logger.debug(`Created default config "${name}" for addon "${addonId}"`);
      return this.deepClone(defaults);
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const saved = YAML.parse(raw) as Record<string, unknown>;
      const merged = this.deepMerge(
        this.deepClone(defaults) as Record<string, unknown>,
        saved,
      ) as T;
      this.persist(filePath, merged);
      return merged;
    } catch (error) {
      this.logger.warn(
        `Failed to parse config "${name}" for addon "${addonId}". Falling back to defaults.`,
        error as Error,
      );
      this.persist(filePath, defaults);
      return this.deepClone(defaults);
    }
  }

  private getAddonDir(addonId: string): string {
    return path.join(this.configDir, addonId);
  }

  private getConfigPath(addonId: string, name: string): string {
    return path.join(this.getAddonDir(addonId), `${name}.yml`);
  }

  private persist(filePath: string, data: Record<string, unknown>): void {
    try {
      let doc: YAML.Document;
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        doc = YAML.parseDocument(raw);
        for (const [key, value] of Object.entries(data)) {
          doc.setIn([key], value);
        }
      } else {
        doc = new YAML.Document(data);
      }
      if (YAML.isMap(doc.contents)) {
        doc.contents.flow = false;
      }
      fs.writeFileSync(filePath, doc.toString({ indent: 2 }), 'utf-8');
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

      if (this.isPlainObject(srcVal) && this.isPlainObject(tgtVal)) {
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
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
