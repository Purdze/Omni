import {
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and } from 'drizzle-orm';
import { getConfig, getMessages, buildPanelRows } from '../utils/common';

export interface ReactionRolesTables {
  panels: any;
  entries: any;
}

export function register(context: AddonContext, tables: ReactionRolesTables): void {
  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('reactionroles')
      .setDescription('Manage reaction role panels')
      .addSubcommand(sub =>
        sub.setName('create').setDescription('Create a new reaction role panel')
          .addChannelOption(opt =>
            opt.setName('channel').setDescription('Channel to post the panel in')
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true),
          )
          .addStringOption(opt =>
            opt.setName('title').setDescription('Panel embed title').setRequired(true),
          )
          .addStringOption(opt =>
            opt.setName('description').setDescription('Panel embed description'),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('addrole').setDescription('Add a role button to a panel')
          .addStringOption(opt =>
            opt.setName('message_id').setDescription('Message ID of the panel').setRequired(true),
          )
          .addRoleOption(opt =>
            opt.setName('role').setDescription('Role to assign').setRequired(true),
          )
          .addStringOption(opt =>
            opt.setName('label').setDescription('Button label (defaults to role name)'),
          )
          .addStringOption(opt =>
            opt.setName('emoji').setDescription('Button emoji'),
          )
          .addStringOption(opt =>
            opt.setName('style').setDescription('Button style')
              .addChoices(
                { name: 'Primary (Blurple)', value: 'Primary' },
                { name: 'Secondary (Grey)', value: 'Secondary' },
                { name: 'Success (Green)', value: 'Success' },
                { name: 'Danger (Red)', value: 'Danger' },
              ),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('removerole').setDescription('Remove a role button from a panel')
          .addStringOption(opt =>
            opt.setName('message_id').setDescription('Message ID of the panel').setRequired(true),
          )
          .addRoleOption(opt =>
            opt.setName('role').setDescription('Role to remove').setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('delete').setDescription('Delete a reaction role panel')
          .addStringOption(opt =>
            opt.setName('message_id').setDescription('Message ID of the panel').setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('list').setDescription('List all reaction role panels in this server'),
      ),
    permission: 'reaction-roles.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const sub = interaction.options.getSubcommand();

      if (sub === 'create') {
        await handleCreate(context, interaction, tables);
      } else if (sub === 'addrole') {
        await handleAddRole(context, interaction, tables);
      } else if (sub === 'removerole') {
        await handleRemoveRole(context, interaction, tables);
      } else if (sub === 'delete') {
        await handleDelete(context, interaction, tables);
      } else if (sub === 'list') {
        await handleList(context, interaction, tables);
      }
    },
  });
}

async function findPanel(
  db: any,
  tables: ReactionRolesTables,
  messageId: string,
  guildId: string,
): Promise<any | null> {
  const rows = await db.select().from(tables.panels).where(
    and(
      eq(tables.panels.messageId, messageId),
      eq(tables.panels.guildId, guildId),
    ),
  );
  return rows.length > 0 ? rows[0] : null;
}

async function replyPanelNotFound(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({
    embeds: [context.embeds.error('Not Found', 'No panel found with that message ID.')],
    ephemeral: true,
  });
}

async function rebuildPanel(
  context: AddonContext,
  db: any,
  tables: ReactionRolesTables,
  panel: any,
): Promise<void> {
  const entries = await db.select().from(tables.entries).where(
    eq(tables.entries.panelId, panel.id),
  );

  const rows = buildPanelRows(panel.id, entries);
  const embed = context.embeds.info(panel.title, panel.description || '\u200b');

  try {
    const channel = await context.client.channels.fetch(panel.channelId) as TextChannel;
    const message = await channel.messages.fetch(panel.messageId);
    await message.edit({ embeds: [embed], components: rows });
  } catch {}
}

async function handleCreate(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: ReactionRolesTables,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description') ?? '';
  const config = getConfig(context);
  const db = context.db.getDb() as any;

  const existing = await db.select().from(tables.panels).where(
    eq(tables.panels.guildId, interaction.guildId!),
  );

  if (existing.length >= config.maxPanelsPerGuild) {
    await interaction.reply({
      embeds: [context.embeds.error('Limit Reached', `You can only have ${config.maxPanelsPerGuild} panels per server.`)],
      ephemeral: true,
    });
    return;
  }

  const embed = context.embeds.info(title, description || '\u200b');

  let sentMessage;
  try {
    sentMessage = await channel.send({ embeds: [embed] });
  } catch {
    await interaction.reply({
      embeds: [context.embeds.error('Failed', 'Could not send the panel message. Check bot permissions in that channel.')],
      ephemeral: true,
    });
    return;
  }

  const values = {
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: sentMessage.id,
    title,
    description,
  };

  await db.insert(tables.panels).values(values);

  await interaction.reply({
    embeds: [context.embeds.success('Panel Created', `Reaction role panel posted in ${channel}. Use \`/reactionroles addrole\` to add role buttons.`)],
  });
}

async function handleAddRole(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: ReactionRolesTables,
): Promise<void> {
  const messageId = interaction.options.getString('message_id', true);
  const role = interaction.options.getRole('role', true);
  const label = interaction.options.getString('label') ?? role.name;
  const emoji = interaction.options.getString('emoji') ?? '';
  const style = interaction.options.getString('style') ?? 'Primary';
  const config = getConfig(context);
  const db = context.db.getDb() as any;

  const panel = await findPanel(db, tables, messageId, interaction.guildId!);
  if (!panel) {
    await replyPanelNotFound(context, interaction);
    return;
  }

  const existingEntries = await db.select().from(tables.entries).where(
    eq(tables.entries.panelId, panel.id),
  );

  if (existingEntries.length >= config.maxRolesPerPanel) {
    await interaction.reply({
      embeds: [context.embeds.error('Limit Reached', `Panels can have at most ${config.maxRolesPerPanel} role buttons.`)],
      ephemeral: true,
    });
    return;
  }

  const duplicate = existingEntries.find((e: any) => e.roleId === role.id);
  if (duplicate) {
    await interaction.reply({
      embeds: [context.embeds.error('Duplicate', `${role} is already on this panel.`)],
      ephemeral: true,
    });
    return;
  }

  await db.insert(tables.entries).values({
    panelId: panel.id,
    roleId: role.id,
    label,
    emoji,
    style,
  });

  await rebuildPanel(context, db, tables, panel);

  await interaction.reply({
    embeds: [context.embeds.success('Role Added', `Added ${role} button to the panel.`)],
  });
}

async function handleRemoveRole(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: ReactionRolesTables,
): Promise<void> {
  const messageId = interaction.options.getString('message_id', true);
  const role = interaction.options.getRole('role', true);
  const db = context.db.getDb() as any;

  const panel = await findPanel(db, tables, messageId, interaction.guildId!);
  if (!panel) {
    await replyPanelNotFound(context, interaction);
    return;
  }

  const existing = await db.select().from(tables.entries).where(
    and(
      eq(tables.entries.panelId, panel.id),
      eq(tables.entries.roleId, role.id),
    ),
  );

  if (existing.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.error('Not Found', `${role} is not on this panel.`)],
      ephemeral: true,
    });
    return;
  }

  await db.delete(tables.entries).where(
    and(
      eq(tables.entries.panelId, panel.id),
      eq(tables.entries.roleId, role.id),
    ),
  );

  await rebuildPanel(context, db, tables, panel);

  await interaction.reply({
    embeds: [context.embeds.success('Role Removed', `Removed ${role} button from the panel.`)],
  });
}

async function handleDelete(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: ReactionRolesTables,
): Promise<void> {
  const messageId = interaction.options.getString('message_id', true);
  const db = context.db.getDb() as any;

  const panel = await findPanel(db, tables, messageId, interaction.guildId!);
  if (!panel) {
    await replyPanelNotFound(context, interaction);
    return;
  }

  try {
    const channel = await context.client.channels.fetch(panel.channelId) as TextChannel;
    const message = await channel.messages.fetch(panel.messageId);
    await message.delete();
  } catch {}

  await db.delete(tables.entries).where(eq(tables.entries.panelId, panel.id));
  await db.delete(tables.panels).where(eq(tables.panels.id, panel.id));

  await interaction.reply({
    embeds: [context.embeds.success('Panel Deleted', `Deleted reaction role panel **${panel.title}**.`)],
  });
}

async function handleList(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: ReactionRolesTables,
): Promise<void> {
  const db = context.db.getDb() as any;

  const panels = await db.select().from(tables.panels).where(
    eq(tables.panels.guildId, interaction.guildId!),
  );

  if (panels.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.info('Reaction Role Panels', 'No panels in this server.')],
    });
    return;
  }

  const lines: string[] = [];
  for (const panel of panels) {
    const entries = await db.select().from(tables.entries).where(
      eq(tables.entries.panelId, panel.id),
    );
    const roleCount = entries.length;
    lines.push(`**${panel.title}** in <#${panel.channelId}> - ${roleCount} role${roleCount !== 1 ? 's' : ''} ([Jump](https://discord.com/channels/${panel.guildId}/${panel.channelId}/${panel.messageId}))`);
  }

  await interaction.reply({
    embeds: [context.embeds.info('Reaction Role Panels', lines.join('\n'))],
  });
}
