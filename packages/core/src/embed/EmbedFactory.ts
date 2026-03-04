import { EmbedBuilder } from 'discord.js';
import type { EmbedFactoryAccess } from '../types/addon';

const COLORS = {
  info: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
} as const;

export class EmbedFactory implements EmbedFactoryAccess {
  info(title: string, description: string): EmbedBuilder {
    return this.base(COLORS.info, title, description);
  }

  success(title: string, description: string): EmbedBuilder {
    return this.base(COLORS.success, title, description);
  }

  warning(title: string, description: string): EmbedBuilder {
    return this.base(COLORS.warning, title, description);
  }

  error(title: string, description: string): EmbedBuilder {
    return this.base(COLORS.error, title, description);
  }

  private base(color: number, title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: 'Powered by Omni' })
      .setTimestamp();
  }
}
