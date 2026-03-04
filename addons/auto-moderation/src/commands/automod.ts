import {
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and } from 'drizzle-orm';
import type { AutoModTables } from '../utils/punishments';
import { getConfig, type PunishmentStep } from '../utils/common';

export function register(context: AddonContext, tables: AutoModTables): void {
  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('automod')
      .setDescription('Configure auto-moderation')
      .addSubcommandGroup(group =>
        group.setName('wordfilter').setDescription('Manage word/regex filters')
          .addSubcommand(sub =>
            sub.setName('add').setDescription('Add a word or regex filter')
              .addStringOption(opt =>
                opt.setName('pattern').setDescription('Word or regex pattern to block').setRequired(true),
              )
              .addStringOption(opt =>
                opt.setName('type').setDescription('Filter type')
                  .setRequired(true)
                  .addChoices(
                    { name: 'Word', value: 'word' },
                    { name: 'Regex', value: 'regex' },
                  ),
              ),
          )
          .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove a filter by ID')
              .addIntegerOption(opt =>
                opt.setName('id').setDescription('Filter ID').setRequired(true),
              ),
          )
          .addSubcommand(sub =>
            sub.setName('list').setDescription('List all word/regex filters'),
          ),
      )
      .addSubcommandGroup(group =>
        group.setName('linkfilter').setDescription('Manage link filtering')
          .addSubcommand(sub =>
            sub.setName('toggle').setDescription('Toggle link filtering on/off'),
          )
          .addSubcommand(sub =>
            sub.setName('allowlist').setDescription('Manage allowed domains')
              .addStringOption(opt =>
                opt.setName('action').setDescription('Add or remove')
                  .setRequired(true)
                  .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' },
                  ),
              )
              .addStringOption(opt =>
                opt.setName('domain').setDescription('Domain to add/remove (e.g. discord.com)').setRequired(true),
              ),
          )
          .addSubcommand(sub =>
            sub.setName('blocklist').setDescription('Manage blocked domains')
              .addStringOption(opt =>
                opt.setName('action').setDescription('Add or remove')
                  .setRequired(true)
                  .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' },
                  ),
              )
              .addStringOption(opt =>
                opt.setName('domain').setDescription('Domain to add/remove (e.g. malware.com)').setRequired(true),
              ),
          ),
      )
      .addSubcommandGroup(group =>
        group.setName('spam').setDescription('Configure spam detection')
          .addSubcommand(sub =>
            sub.setName('config').setDescription('Set spam detection thresholds')
              .addIntegerOption(opt =>
                opt.setName('max_messages').setDescription('Max messages in window').setMinValue(2).setMaxValue(30),
              )
              .addIntegerOption(opt =>
                opt.setName('window').setDescription('Message window in seconds').setMinValue(1).setMaxValue(60),
              )
              .addIntegerOption(opt =>
                opt.setName('max_duplicates').setDescription('Max duplicate messages').setMinValue(2).setMaxValue(20),
              )
              .addIntegerOption(opt =>
                opt.setName('duplicate_window').setDescription('Duplicate window in seconds').setMinValue(5).setMaxValue(120),
              )
              .addIntegerOption(opt =>
                opt.setName('max_mentions').setDescription('Max mentions per message').setMinValue(1).setMaxValue(50),
              ),
          ),
      )
      .addSubcommandGroup(group =>
        group.setName('raid').setDescription('Configure anti-raid protection')
          .addSubcommand(sub =>
            sub.setName('config').setDescription('Set raid detection settings')
              .addIntegerOption(opt =>
                opt.setName('threshold').setDescription('Joins to trigger raid detection').setMinValue(3).setMaxValue(100),
              )
              .addIntegerOption(opt =>
                opt.setName('window').setDescription('Time window in seconds').setMinValue(5).setMaxValue(300),
              )
              .addStringOption(opt =>
                opt.setName('action').setDescription('Action on raid detection')
                  .addChoices(
                    { name: 'Lockdown (set verification to highest)', value: 'lockdown' },
                    { name: 'Alert (send warning to channel)', value: 'alert' },
                  ),
              )
              .addChannelOption(opt =>
                opt.setName('alert_channel').setDescription('Channel for raid alerts')
                  .addChannelTypes(ChannelType.GuildText),
              ),
          ),
      )
      .addSubcommandGroup(group =>
        group.setName('punishments').setDescription('Manage escalating punishments')
          .addSubcommand(sub =>
            sub.setName('set').setDescription('Set a punishment at a violation threshold')
              .addIntegerOption(opt =>
                opt.setName('threshold').setDescription('Violation count to trigger this punishment').setRequired(true).setMinValue(1),
              )
              .addStringOption(opt =>
                opt.setName('action').setDescription('Punishment action')
                  .setRequired(true)
                  .addChoices(
                    { name: 'Warn', value: 'warn' },
                    { name: 'Mute', value: 'mute' },
                    { name: 'Kick', value: 'kick' },
                    { name: 'Ban', value: 'ban' },
                  ),
              )
              .addStringOption(opt =>
                opt.setName('duration').setDescription('Duration for mute (e.g. 5m, 1h, 1d)'),
              ),
          )
          .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove a punishment at a threshold')
              .addIntegerOption(opt =>
                opt.setName('threshold').setDescription('Threshold to remove').setRequired(true).setMinValue(1),
              ),
          )
          .addSubcommand(sub =>
            sub.setName('list').setDescription('List all configured punishments'),
          ),
      )
      .addSubcommandGroup(group =>
        group.setName('exempt').setDescription('Manage exemptions from auto-moderation')
          .addSubcommand(sub =>
            sub.setName('add').setDescription('Add an exempt role or channel')
              .addRoleOption(opt =>
                opt.setName('role').setDescription('Role to exempt'),
              )
              .addChannelOption(opt =>
                opt.setName('channel').setDescription('Channel to exempt')
                  .addChannelTypes(ChannelType.GuildText),
              ),
          )
          .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove an exemption')
              .addRoleOption(opt =>
                opt.setName('role').setDescription('Role to un-exempt'),
              )
              .addChannelOption(opt =>
                opt.setName('channel').setDescription('Channel to un-exempt')
                  .addChannelTypes(ChannelType.GuildText),
              ),
          )
          .addSubcommand(sub =>
            sub.setName('list').setDescription('List all exemptions'),
          ),
      ),
    permission: 'auto-moderation.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      const group = interaction.options.getSubcommandGroup(true);
      const sub = interaction.options.getSubcommand(true);

      if (group === 'wordfilter') {
        if (sub === 'add') await handleWordFilterAdd(context, interaction, tables);
        else if (sub === 'remove') await handleWordFilterRemove(context, interaction, tables);
        else if (sub === 'list') await handleWordFilterList(context, interaction, tables);
      } else if (group === 'linkfilter') {
        if (sub === 'toggle') await handleLinkFilterToggle(context, interaction);
        else if (sub === 'allowlist') await handleLinkList(context, interaction, tables, 'link_allow');
        else if (sub === 'blocklist') await handleLinkList(context, interaction, tables, 'link_block');
      } else if (group === 'spam') {
        await handleSpamConfig(context, interaction);
      } else if (group === 'raid') {
        await handleRaidConfig(context, interaction);
      } else if (group === 'punishments') {
        if (sub === 'set') await handlePunishmentSet(context, interaction);
        else if (sub === 'remove') await handlePunishmentRemove(context, interaction);
        else if (sub === 'list') await handlePunishmentList(context, interaction);
      } else if (group === 'exempt') {
        if (sub === 'add') await handleExemptModify(context, interaction, 'add');
        else if (sub === 'remove') await handleExemptModify(context, interaction, 'remove');
        else if (sub === 'list') await handleExemptList(context, interaction);
      }
    },
  });

  context.commands.register({
    data: new SlashCommandBuilder()
      .setName('automod-status')
      .setDescription('Show current auto-moderation settings'),
    permission: 'auto-moderation.manage',
    execute: async (interaction: ChatInputCommandInteraction) => {
      await handleStatus(context, interaction, tables);
    },
  });
}

async function handleWordFilterAdd(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: AutoModTables,
): Promise<void> {
  const pattern = interaction.options.getString('pattern', true);
  const type = interaction.options.getString('type', true);
  const db = context.db.getDb() as any;

  if (type === 'regex') {
    try {
      new RegExp(pattern);
    } catch {
      await interaction.reply({
        embeds: [context.embeds.error('Invalid Regex', `\`${pattern}\` is not a valid regular expression.`)],
        ephemeral: true,
      });
      return;
    }
  }

  await db.insert(tables.filters).values({
    guildId: interaction.guildId!,
    filterType: type,
    pattern,
    enabled: 1,
  });

  await interaction.reply({
    embeds: [context.embeds.success('Filter Added', `Added ${type} filter: \`${pattern}\``)],
  });
}

async function handleWordFilterRemove(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: AutoModTables,
): Promise<void> {
  const id = interaction.options.getInteger('id', true);
  const db = context.db.getDb() as any;

  const rows = await db.select().from(tables.filters).where(
    and(eq(tables.filters.id, id), eq(tables.filters.guildId, interaction.guildId!)),
  );

  if (rows.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.error('Not Found', `No filter found with ID ${id}.`)],
      ephemeral: true,
    });
    return;
  }

  await db.delete(tables.filters).where(eq(tables.filters.id, id));

  await interaction.reply({
    embeds: [context.embeds.success('Filter Removed', `Removed filter #${id}: \`${rows[0].pattern}\``)],
  });
}

async function handleWordFilterList(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: AutoModTables,
): Promise<void> {
  const db = context.db.getDb() as any;

  const filters = await db.select().from(tables.filters).where(
    eq(tables.filters.guildId, interaction.guildId!),
  );

  const wordFilters = filters.filter((f: any) => f.filterType === 'word' || f.filterType === 'regex');

  if (wordFilters.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.info('Word Filters', 'No word or regex filters configured.')],
    });
    return;
  }

  const lines = wordFilters.map((f: any) =>
    `**#${f.id}** [${f.filterType}] \`${f.pattern}\` ${f.enabled ? '' : '(disabled)'}`,
  );

  await interaction.reply({
    embeds: [context.embeds.info('Word Filters', lines.join('\n'))],
  });
}

async function handleLinkFilterToggle(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const config = getConfig(context);
  const newValue = !config.linkFilterEnabled;
  context.config.set('linkFilterEnabled', newValue as any);

  await interaction.reply({
    embeds: [context.embeds.success('Link Filter', `Link filtering is now **${newValue ? 'enabled' : 'disabled'}**.`)],
  });
}

async function findDomainFilter(
  db: any,
  tables: AutoModTables,
  guildId: string,
  filterType: string,
  domain: string,
): Promise<any[]> {
  return db.select().from(tables.filters).where(
    and(
      eq(tables.filters.guildId, guildId),
      eq(tables.filters.filterType, filterType),
      eq(tables.filters.pattern, domain),
    ),
  );
}

async function handleLinkList(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: AutoModTables,
  filterType: 'link_allow' | 'link_block',
): Promise<void> {
  const action = interaction.options.getString('action', true);
  const domain = interaction.options.getString('domain', true).toLowerCase();
  const db = context.db.getDb() as any;
  const label = filterType === 'link_allow' ? 'Allowlist' : 'Blocklist';

  const existing = await findDomainFilter(db, tables, interaction.guildId!, filterType, domain);

  if (action === 'add') {
    if (existing.length > 0) {
      await interaction.reply({
        embeds: [context.embeds.error('Duplicate', `\`${domain}\` is already on the ${label.toLowerCase()}.`)],
        ephemeral: true,
      });
      return;
    }

    await db.insert(tables.filters).values({
      guildId: interaction.guildId!,
      filterType,
      pattern: domain,
      enabled: 1,
    });

    await interaction.reply({
      embeds: [context.embeds.success(label, `Added \`${domain}\` to the ${label.toLowerCase()}.`)],
    });
  } else {
    if (existing.length === 0) {
      await interaction.reply({
        embeds: [context.embeds.error('Not Found', `\`${domain}\` is not on the ${label.toLowerCase()}.`)],
        ephemeral: true,
      });
      return;
    }

    await db.delete(tables.filters).where(eq(tables.filters.id, existing[0].id));

    await interaction.reply({
      embeds: [context.embeds.success(label, `Removed \`${domain}\` from the ${label.toLowerCase()}.`)],
    });
  }
}

async function handleSpamConfig(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const updates: [string, string, number | null][] = [
    ['spamMaxMessages', 'Max messages', interaction.options.getInteger('max_messages')],
    ['spamMessageWindow', 'Message window', interaction.options.getInteger('window')],
    ['spamMaxDuplicates', 'Max duplicates', interaction.options.getInteger('max_duplicates')],
    ['spamDuplicateWindow', 'Duplicate window', interaction.options.getInteger('duplicate_window')],
    ['spamMaxMentions', 'Max mentions', interaction.options.getInteger('max_mentions')],
  ];

  const changes: string[] = [];
  for (const [key, label, value] of updates) {
    if (value !== null) {
      context.config.set(key, value as any);
      const suffix = key.includes('Window') ? 's' : '';
      changes.push(`${label}: **${value}${suffix}**`);
    }
  }

  if (changes.length === 0) {
    const config = getConfig(context);
    await interaction.reply({
      embeds: [context.embeds.info('Spam Config', [
        `Max messages: **${config.spamMaxMessages}** / **${config.spamMessageWindow}s**`,
        `Max duplicates: **${config.spamMaxDuplicates}** / **${config.spamDuplicateWindow}s**`,
        `Max mentions: **${config.spamMaxMentions}**`,
        `Delete spam: **${config.spamDeleteMessage ? 'Yes' : 'No'}**`,
      ].join('\n'))],
    });
    return;
  }

  await interaction.reply({
    embeds: [context.embeds.success('Spam Config Updated', changes.join('\n'))],
  });
}

async function handleRaidConfig(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const threshold = interaction.options.getInteger('threshold');
  const window = interaction.options.getInteger('window');
  const action = interaction.options.getString('action');
  const alertChannel = interaction.options.getChannel('alert_channel');

  const changes: string[] = [];

  if (threshold !== null) {
    context.config.set('raidJoinThreshold', threshold as any);
    changes.push(`Threshold: **${threshold} joins**`);
  }
  if (window !== null) {
    context.config.set('raidJoinWindow', window as any);
    changes.push(`Window: **${window}s**`);
  }
  if (action !== null) {
    context.config.set('raidAction', action as any);
    changes.push(`Action: **${action}**`);
  }
  if (alertChannel) {
    context.config.set('raidAlertChannelId', alertChannel.id as any);
    changes.push(`Alert channel: <#${alertChannel.id}>`);
  }

  if (!context.config.getAll().raidEnabled) {
    context.config.set('raidEnabled', true as any);
    changes.push('Raid protection: **enabled**');
  }

  if (changes.length === 0) {
    const config = getConfig(context);
    await interaction.reply({
      embeds: [context.embeds.info('Raid Config', [
        `Enabled: **${config.raidEnabled ? 'Yes' : 'No'}**`,
        `Threshold: **${config.raidJoinThreshold} joins** / **${config.raidJoinWindow}s**`,
        `Action: **${config.raidAction}**`,
        config.raidAlertChannelId ? `Alert channel: <#${config.raidAlertChannelId}>` : 'Alert channel: not set',
      ].join('\n'))],
    });
    return;
  }

  await interaction.reply({
    embeds: [context.embeds.success('Raid Config Updated', changes.join('\n'))],
  });
}

async function handlePunishmentSet(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const threshold = interaction.options.getInteger('threshold', true);
  const action = interaction.options.getString('action', true) as PunishmentStep['action'];
  const duration = interaction.options.getString('duration') ?? undefined;

  const config = getConfig(context);
  const punishments: PunishmentStep[] = config.punishments ?? [];

  const idx = punishments.findIndex(p => p.threshold === threshold);
  const step: PunishmentStep = { threshold, action, duration };

  if (idx >= 0) {
    punishments[idx] = step;
  } else {
    punishments.push(step);
  }

  punishments.sort((a, b) => a.threshold - b.threshold);
  context.config.set('punishments', punishments as any);

  await interaction.reply({
    embeds: [context.embeds.success('Punishment Set', `At **${threshold}** violations: **${action}**${duration ? ` (${duration})` : ''}`)],
  });
}

async function handlePunishmentRemove(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const threshold = interaction.options.getInteger('threshold', true);
  const config = getConfig(context);
  const punishments: PunishmentStep[] = config.punishments ?? [];

  const idx = punishments.findIndex(p => p.threshold === threshold);
  if (idx < 0) {
    await interaction.reply({
      embeds: [context.embeds.error('Not Found', `No punishment at threshold ${threshold}.`)],
      ephemeral: true,
    });
    return;
  }

  punishments.splice(idx, 1);
  context.config.set('punishments', punishments as any);

  await interaction.reply({
    embeds: [context.embeds.success('Punishment Removed', `Removed punishment at threshold ${threshold}.`)],
  });
}

async function handlePunishmentList(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const config = getConfig(context);
  const punishments: PunishmentStep[] = config.punishments ?? [];

  if (punishments.length === 0) {
    await interaction.reply({
      embeds: [context.embeds.info('Punishments', 'No punishments configured.')],
    });
    return;
  }

  const lines = punishments
    .sort((a, b) => a.threshold - b.threshold)
    .map(p => `**${p.threshold}** violations -> **${p.action}**${p.duration ? ` (${p.duration})` : ''}`);

  await interaction.reply({
    embeds: [context.embeds.info('Punishments', lines.join('\n'))],
  });
}

function modifyConfigArray(
  context: AddonContext,
  configKey: string,
  id: string,
  mode: 'add' | 'remove',
): { changed: boolean; alreadyExists: boolean } {
  const config = getConfig(context);
  const arr: string[] = (config as any)[configKey] ?? [];
  const idx = arr.indexOf(id);

  if (mode === 'add') {
    if (idx >= 0) return { changed: false, alreadyExists: true };
    arr.push(id);
    context.config.set(configKey, arr as any);
    return { changed: true, alreadyExists: false };
  } else {
    if (idx < 0) return { changed: false, alreadyExists: false };
    arr.splice(idx, 1);
    context.config.set(configKey, arr as any);
    return { changed: true, alreadyExists: true };
  }
}

async function handleExemptModify(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  mode: 'add' | 'remove',
): Promise<void> {
  const role = interaction.options.getRole('role');
  const channel = interaction.options.getChannel('channel');

  if (!role && !channel) {
    await interaction.reply({
      embeds: [context.embeds.error('Missing Option', `Provide a role or channel to ${mode === 'add' ? 'exempt' : 'un-exempt'}.`)],
      ephemeral: true,
    });
    return;
  }

  const changes: string[] = [];
  const verb = mode === 'add' ? 'Added' : 'Removed';
  const preposition = mode === 'add' ? 'is already' : 'is not';

  if (role) {
    const result = modifyConfigArray(context, 'exemptRoles', role.id, mode);
    changes.push(result.changed
      ? `${verb} role: ${role}`
      : `Role ${role} ${preposition} exempt.`);
  }

  if (channel) {
    const result = modifyConfigArray(context, 'exemptChannels', channel.id, mode);
    changes.push(result.changed
      ? `${verb} channel: <#${channel.id}>`
      : `Channel <#${channel.id}> ${preposition} exempt.`);
  }

  const title = mode === 'add' ? 'Exemption Added' : 'Exemption Removed';
  await interaction.reply({
    embeds: [context.embeds.success(title, changes.join('\n'))],
  });
}

async function handleExemptList(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const config = getConfig(context);
  const roles = (config.exemptRoles ?? []).map((id: string) => `<@&${id}>`);
  const channels = (config.exemptChannels ?? []).map((id: string) => `<#${id}>`);

  const lines: string[] = [];
  if (roles.length > 0) lines.push(`**Roles:** ${roles.join(', ')}`);
  if (channels.length > 0) lines.push(`**Channels:** ${channels.join(', ')}`);

  await interaction.reply({
    embeds: [context.embeds.info('Exemptions', lines.length > 0 ? lines.join('\n') : 'No exemptions configured.')],
  });
}

async function handleStatus(
  context: AddonContext,
  interaction: ChatInputCommandInteraction,
  tables: AutoModTables,
): Promise<void> {
  const config = getConfig(context);
  const db = context.db.getDb() as any;

  const filters = await db.select().from(tables.filters).where(
    eq(tables.filters.guildId, interaction.guildId!),
  );

  const countByType = (type: string) => filters.filter((f: any) => f.filterType === type).length;
  const wordCount = countByType('word') + countByType('regex');
  const punishments: PunishmentStep[] = config.punishments ?? [];

  const sections = [
    `**Word Filter:** ${config.wordFilterEnabled ? 'Enabled' : 'Disabled'} (${wordCount} patterns)`,
    `**Spam Detection:** ${config.spamEnabled ? 'Enabled' : 'Disabled'} (${config.spamMaxMessages}/${config.spamMessageWindow}s, ${config.spamMaxDuplicates} dupes/${config.spamDuplicateWindow}s, ${config.spamMaxMentions} mentions)`,
    `**Link Filter:** ${config.linkFilterEnabled ? 'Enabled' : 'Disabled'} (${countByType('link_allow')} allowed, ${countByType('link_block')} blocked)`,
    `**Anti-Raid:** ${config.raidEnabled ? 'Enabled' : 'Disabled'} (${config.raidJoinThreshold}/${config.raidJoinWindow}s, action: ${config.raidAction})`,
    `**Punishments:** ${punishments.length} steps configured`,
    `**Exempt Roles:** ${(config.exemptRoles ?? []).length}`,
    `**Exempt Channels:** ${(config.exemptChannels ?? []).length}`,
    config.logChannelId ? `**Log Channel:** <#${config.logChannelId}>` : '**Log Channel:** not set',
  ];

  await interaction.reply({
    embeds: [context.embeds.info('Auto-Moderation Status', sections.join('\n'))],
  });
}
