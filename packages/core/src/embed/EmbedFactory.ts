import { EmbedBuilder } from 'discord.js';
import type { EmbedFactoryAccess, EmbedOptions } from '../types/addon';

const COLORS = {
  info: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
} as const;

export class EmbedFactory implements EmbedFactoryAccess {
  info(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(COLORS.info, title, description, options);
  }

  success(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(COLORS.success, title, description, options);
  }

  warning(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(COLORS.warning, title, description, options);
  }

  error(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(COLORS.error, title, description, options);
  }

  private base(color: number, title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: options?.footer ?? 'Powered by Omni' })
      .setTimestamp();

    if (options?.fields) embed.addFields(options.fields);
    if (options?.author) embed.setAuthor(options.author);
    if (options?.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options?.image) embed.setImage(options.image);
    if (options?.url) embed.setURL(options.url);

    return embed;
  }
}
