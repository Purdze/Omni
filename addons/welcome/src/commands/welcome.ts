import {
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';
import type { AddonContext } from '@omni/core';
import { getConfig, getMessages, msg } from '../utils/common';

export function register(context: AddonContext): void {
  const messages = getMessages(context);

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('Manage welcome and leave settings')
      .addSubcommandGroup(group =>
        group.setName('autorole').setDescription('Manage auto-roles')
          .addSubcommand(sub =>
            sub.setName('add').setDescription('Add an auto-role')
              .addRoleOption(opt => opt.setName('role').setDescription('The role to assign on join').setRequired(true)),
          )
          .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove an auto-role')
              .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true)),
          )
          .addSubcommand(sub =>
            sub.setName('list').setDescription('List current auto-roles'),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('channel').setDescription('Set the welcome or leave channel')
          .addStringOption(opt =>
            opt.setName('type').setDescription('Channel type to set')
              .setRequired(true)
              .addChoices(
                { name: 'Welcome', value: 'welcome' },
                { name: 'Leave', value: 'leave' },
              ),
          )
          .addChannelOption(opt =>
            opt.setName('channel').setDescription('The channel (leave empty to disable)')
              .addChannelTypes(ChannelType.GuildText),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('membercount').setDescription('Set the member count voice channel')
          .addChannelOption(opt =>
            opt.setName('channel').setDescription('The voice channel (leave empty to disable)')
              .addChannelTypes(ChannelType.GuildVoice),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('test').setDescription('Preview a welcome or leave message')
          .addStringOption(opt =>
            opt.setName('type').setDescription('Message type to preview')
              .setRequired(true)
              .addChoices(
                { name: 'Welcome', value: 'welcome' },
                { name: 'Leave', value: 'leave' },
              ),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('settings').setDescription('Show current welcome/leave settings'),
      ),
    permission: 'welcome.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      if (group === 'autorole') {
        await handleAutorole(context, interaction, sub);
      } else if (sub === 'channel') {
        await handleChannel(context, interaction);
      } else if (sub === 'membercount') {
        await handleMemberCount(context, interaction);
      } else if (sub === 'test') {
        await handleTest(context, interaction, messages);
      } else if (sub === 'settings') {
        await handleSettings(context, interaction);
      }
    },
  });
}

async function handleAutorole(context: AddonContext, interaction: ChatInputCommandInteraction, sub: string): Promise<void> {
  const config = getConfig(context);
  const roles: string[] = Array.isArray(config.autoRoleIds) ? [...config.autoRoleIds] : [];

  if (sub === 'add') {
    const role = interaction.options.getRole('role', true);
    if (roles.includes(role.id)) {
      await interaction.reply({ embeds: [context.embeds.error('Already Added', `${role} is already an auto-role.`)], ephemeral: true });
      return;
    }
    roles.push(role.id);
    context.config.set('autoRoleIds', roles as any);
    await interaction.reply({ embeds: [context.embeds.success('Auto-Role Added', `${role} will now be assigned to new members.`)] });
  } else if (sub === 'remove') {
    const role = interaction.options.getRole('role', true);
    const idx = roles.indexOf(role.id);
    if (idx === -1) {
      await interaction.reply({ embeds: [context.embeds.error('Not Found', `${role} is not an auto-role.`)], ephemeral: true });
      return;
    }
    roles.splice(idx, 1);
    context.config.set('autoRoleIds', roles as any);
    await interaction.reply({ embeds: [context.embeds.success('Auto-Role Removed', `${role} will no longer be assigned to new members.`)] });
  } else if (sub === 'list') {
    if (roles.length === 0) {
      await interaction.reply({ embeds: [context.embeds.info('Auto-Roles', 'No auto-roles configured.')] });
      return;
    }
    const list = roles.map(id => `<@&${id}>`).join('\n');
    await interaction.reply({ embeds: [context.embeds.info('Auto-Roles', list)] });
  }
}

async function handleChannel(context: AddonContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const type = interaction.options.getString('type', true);
  const channel = interaction.options.getChannel('channel') as TextChannel | null;
  const key = type === 'welcome' ? 'welcomeChannelId' : 'leaveChannelId';
  const label = type === 'welcome' ? 'Welcome' : 'Leave';

  if (channel) {
    context.config.set(key, channel.id as any);
    await interaction.reply({ embeds: [context.embeds.success('Channel Set', `${label} messages will be sent to ${channel}.`)] });
  } else {
    context.config.set(key, '' as any);
    await interaction.reply({ embeds: [context.embeds.success('Channel Disabled', `${label} messages have been disabled.`)] });
  }
}

async function handleMemberCount(context: AddonContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel') as VoiceChannel | null;

  if (channel) {
    context.config.set('memberCountChannelId', channel.id as any);
    await interaction.reply({ embeds: [context.embeds.success('Member Count Channel Set', `${channel} will display the member count.`)] });
  } else {
    context.config.set('memberCountChannelId', '' as any);
    await interaction.reply({ embeds: [context.embeds.success('Member Count Disabled', 'Member count channel has been disabled.')] });
  }
}

async function handleTest(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  messages: ReturnType<typeof getMessages>,
): Promise<void> {
  const type = interaction.options.getString('type', true);
  const member = interaction.member!;
  const guild = interaction.guild!;

  const vars = {
    user: `<@${member.user.id}>`,
    tag: member.user.username,
    server: guild.name,
    count: `${guild.memberCount}`,
  };

  if (type === 'welcome') {
    const title = msg(messages, 'welcomeTitle', vars);
    const body = msg(messages, 'welcomeBody', vars);
    await interaction.reply({ embeds: [context.embeds.success(title, body)] });
  } else {
    const title = msg(messages, 'leaveTitle', vars);
    const body = msg(messages, 'leaveBody', vars);
    await interaction.reply({ embeds: [context.embeds.info(title, body)] });
  }
}

async function handleSettings(context: AddonContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const config = getConfig(context);
  const roles = Array.isArray(config.autoRoleIds) ? config.autoRoleIds : [];

  const lines = [
    `**Welcome Channel:** ${config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : 'Not set'}`,
    `**Leave Channel:** ${config.leaveChannelId ? `<#${config.leaveChannelId}>` : 'Not set'}`,
    `**DM on Join:** ${config.dmOnJoin ? 'Enabled' : 'Disabled'}`,
    `**Auto-Roles:** ${roles.length > 0 ? roles.map(id => `<@&${id}>`).join(', ') : 'None'}`,
    `**Member Count Channel:** ${config.memberCountChannelId ? `<#${config.memberCountChannelId}>` : 'Not set'}`,
    `**Member Count Format:** \`${config.memberCountFormat}\``,
  ];

  await interaction.reply({ embeds: [context.embeds.info('Welcome/Leave Settings', lines.join('\n'))] });
}
