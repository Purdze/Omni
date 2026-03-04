import { EmbedBuilder } from 'discord.js';
import type { EmbedFactoryAccess, EmbedOptions } from '../types/addon';
import type { BrandingConfig } from '../types/config';

const DEFAULT_COLORS = {
  info: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
} as const;

export class EmbedFactory implements EmbedFactoryAccess {
  private readonly brandColor: number;
  private readonly footerText: string;

  constructor(branding?: BrandingConfig) {
    this.brandColor = branding?.color
      ? parseInt(branding.color.replace('#', ''), 16)
      : DEFAULT_COLORS.info;
    this.footerText = branding?.footerText ?? 'Powered by Omni';
  }

  info(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(this.brandColor, title, description, options);
  }

  success(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(DEFAULT_COLORS.success, title, description, options);
  }

  warning(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(DEFAULT_COLORS.warning, title, description, options);
  }

  error(title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    return this.base(DEFAULT_COLORS.error, title, description, options);
  }

  private base(color: number, title: string, description: string, options?: EmbedOptions): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: options?.footer ?? this.footerText })
      .setTimestamp();

    if (options?.fields) embed.addFields(options.fields);
    if (options?.author) embed.setAuthor(options.author);
    if (options?.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options?.image) embed.setImage(options.image);
    if (options?.url) embed.setURL(options.url);

    return embed;
  }
}
