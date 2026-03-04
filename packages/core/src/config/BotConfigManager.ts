import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import type { BotConfig } from '../types/config';

const DEFAULTS: BotConfig = {
  branding: {
    color: '#5865F2',
    footerText: 'Powered by Omni',
  },
  presence: {
    status: 'online',
    activityType: 'Playing',
    activityText: 'omnibot.dev',
  },
};

const SEED_YAML = `# Omni Bot Configuration

branding:
  # Primary embed color (hex)
  color: "${DEFAULTS.branding.color}"
  # Footer text shown on all embeds
  footerText: "${DEFAULTS.branding.footerText}"

presence:
  # Bot status: online, idle, dnd, invisible
  status: ${DEFAULTS.presence.status}
  # Activity type: Playing, Listening, Watching, Competing
  activityType: ${DEFAULTS.presence.activityType}
  # Activity text shown after the type (e.g. "Playing omnibot.dev")
  activityText: "${DEFAULTS.presence.activityText}"
`;

export class BotConfigManager {
  private readonly configPath: string;

  constructor(projectRoot: string) {
    this.configPath = path.join(projectRoot, 'config', 'bot.yml');
  }

  load(): BotConfig {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });

    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, SEED_YAML, 'utf-8');
      return this.cloneDefaults();
    }

    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = YAML.parse(raw) as Partial<BotConfig> | null;

      return {
        branding: {
          color: parsed?.branding?.color ?? DEFAULTS.branding.color,
          footerText: parsed?.branding?.footerText ?? DEFAULTS.branding.footerText,
        },
        presence: {
          status: parsed?.presence?.status ?? DEFAULTS.presence.status,
          activityType: parsed?.presence?.activityType ?? DEFAULTS.presence.activityType,
          activityText: parsed?.presence?.activityText ?? DEFAULTS.presence.activityText,
        },
      };
    } catch {
      return this.cloneDefaults();
    }
  }

  private cloneDefaults(): BotConfig {
    return {
      branding: { ...DEFAULTS.branding },
      presence: { ...DEFAULTS.presence },
    };
  }
}
