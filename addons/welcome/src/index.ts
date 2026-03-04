import { Addon } from '@omni/core';
import type { GuildMember, PartialGuildMember, TextChannel, VoiceChannel } from 'discord.js';
import type { AddonConfigAccess } from '@omni/core';
import { CONFIG_DEFAULTS, CONFIG_SEED, getConfig, getMessages, msg, type WelcomeMessages } from './utils/common';
import * as welcomeCmd from './commands/welcome';

export default class WelcomeAddon extends Addon {
  async onLoad(): Promise<void> {
    this.context.config.seed(CONFIG_SEED);
    const cfg = this.context.config.getAll() as Record<string, unknown>;
    for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
      if (!(key in cfg)) {
        this.context.config.set(key, value as any);
      }
    }

    welcomeCmd.register(this.context);

    this.context.logger.info('Welcome/Leave addon loaded - 1 command registered');
  }

  async onEnable(): Promise<void> {
    const { events, logger } = this.context;

    events.on('guildMemberAdd', async (member: GuildMember) => {
      if (!(await this.context.modules.isEnabled(member.guild.id))) return;

      const config = getConfig(this.context);
      const messages = getMessages(this.context);
      const vars = this.buildVars(member);

      await this.sendToChannel(member, config.welcomeChannelId, messages, 'welcomeTitle', 'welcomeBody', 'success', vars);

      if (config.dmOnJoin) {
        try {
          const body = msg(messages, 'dmWelcome', vars);
          await member.user.send({ embeds: [this.context.embeds.info('Welcome!', body)] });
        } catch {}
      }

      if (Array.isArray(config.autoRoleIds)) {
        for (const roleId of config.autoRoleIds) {
          try {
            await member.roles.add(roleId);
          } catch (err) {
            logger.warn(`Failed to assign auto-role ${roleId}: ${err}`);
          }
        }
      }

      await this.updateMemberCount(member.guild.id);
    });

    events.on('guildMemberRemove', async (member: GuildMember | PartialGuildMember) => {
      if (!(await this.context.modules.isEnabled(member.guild.id))) return;

      const config = getConfig(this.context);
      const messages = getMessages(this.context);
      const vars = this.buildVars(member);

      await this.sendToChannel(member, config.leaveChannelId, messages, 'leaveTitle', 'leaveBody', 'info', vars);
      await this.updateMemberCount(member.guild.id);
    });

    logger.info('Welcome/Leave addon enabled');
  }

  async onDisable(): Promise<void> {
    this.context.logger.info('Welcome/Leave addon disabled');
  }

  private buildVars(member: GuildMember | PartialGuildMember): Record<string, string> {
    return {
      user: `${member}`,
      tag: member.user.username,
      server: member.guild.name,
      count: `${member.guild.memberCount}`,
    };
  }

  private async sendToChannel(
    member: GuildMember | PartialGuildMember,
    channelId: string,
    messages: AddonConfigAccess<WelcomeMessages>,
    titleKey: keyof WelcomeMessages,
    bodyKey: keyof WelcomeMessages,
    style: 'success' | 'info',
    vars: Record<string, string>,
  ): Promise<void> {
    if (!channelId) return;

    try {
      const channel = await member.guild.channels.fetch(channelId) as TextChannel | null;
      if (channel) {
        const title = msg(messages, titleKey, vars);
        const body = msg(messages, bodyKey, vars);
        await channel.send({ embeds: [this.context.embeds[style](title, body)] });
      }
    } catch (err) {
      this.context.logger.warn(`Failed to send message to channel ${channelId}: ${err}`);
    }
  }

  private async updateMemberCount(guildId: string): Promise<void> {
    const config = getConfig(this.context);
    if (!config.memberCountChannelId) return;

    try {
      const guild = await this.context.client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(config.memberCountChannelId) as VoiceChannel | null;
      if (channel) {
        const name = config.memberCountFormat.replaceAll('{count}', `${guild.memberCount}`);
        await channel.setName(name);
      }
    } catch (err) {
      this.context.logger.warn(`Failed to update member count channel: ${err}`);
    }
  }
}
