import { eq, and } from 'drizzle-orm';
import { DatabaseManager } from '../database/DatabaseManager';
import { getCoreSchema } from '../database/schema';
import type { AddonLogger } from '../types/addon';

export class ModuleManager {
  private readonly db: DatabaseManager;
  private readonly logger: AddonLogger;

  constructor(db: DatabaseManager, logger: AddonLogger) {
    this.db = db;
    this.logger = logger;
  }

  private get table() {
    return getCoreSchema(this.db.driver).disabledModules;
  }

  private get drizzle(): any {
    return this.db.getDb();
  }

  async isEnabled(guildId: string, addonId: string): Promise<boolean> {
    const t = this.table;
    const rows: any[] = await this.drizzle
      .select()
      .from(t)
      .where(and(eq(t.guildId, guildId), eq(t.addonId, addonId)));
    return rows.length === 0;
  }

  async disable(guildId: string, addonId: string): Promise<void> {
    if (!(await this.isEnabled(guildId, addonId))) return;

    await this.drizzle.insert(this.table).values({ guildId, addonId });
    this.logger.info(`Disabled module "${addonId}" in guild ${guildId}`);
  }

  async enable(guildId: string, addonId: string): Promise<void> {
    const t = this.table;
    await this.drizzle
      .delete(t)
      .where(and(eq(t.guildId, guildId), eq(t.addonId, addonId)));
    this.logger.info(`Enabled module "${addonId}" in guild ${guildId}`);
  }

  async getDisabledModules(guildId: string): Promise<string[]> {
    const t = this.table;
    const rows: any[] = await this.drizzle
      .select({ addonId: t.addonId })
      .from(t)
      .where(eq(t.guildId, guildId));
    return rows.map((r: any) => r.addonId);
  }
}
