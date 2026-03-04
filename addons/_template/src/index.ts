import { Addon } from '@omni/core';
import { SlashCommandBuilder, ChannelType, type TextChannel } from 'discord.js';

// ─── Config ──────────────────────────────────────────────────────────────────
// Define a typed config interface. The config system auto-creates a JSON file
// at config/addons/{addonId}.json with these defaults on first load. User edits
// are preserved across restarts via deep-merge with defaults.

interface MyAddonConfig {
  enabled: boolean;
  channelId: string;
  prefix: string;
  maxItems: number;
}

const DEFAULTS: MyAddonConfig = {
  enabled: true,
  channelId: '',
  prefix: '!',
  maxItems: 10,
};

// ─── Inter-Addon API ─────────────────────────────────────────────────────────
// If other addons need to interact with yours, define a typed API interface.
// Other addons consume it via: context.addons.getAPI<MyAddonAPI>('my-addon')

type MyAddonAPI = {
  getItemCount(): number;
  addItem(name: string): void;
};

// ─── Addon Class ─────────────────────────────────────────────────────────────

export default class MyAddon extends Addon {

  // onLoad — called once after instantiation.
  // Register commands, events, permissions, config, and DB schemas here.
  // Do NOT start intervals or long-running processes — that's for onEnable.
  async onLoad(): Promise<void> {
    const { commands, config, permissions, logger } = this.context;

    // ── Config ──────────────────────────────────────────────────────────
    // config.get/set/getAll/reset are available immediately.
    // Pass defaults so new keys are auto-merged into existing user configs.
    const cfg = config.getAll() as unknown as MyAddonConfig;
    logger.info(`Loaded with prefix: ${cfg.prefix}`);

    // ── Permissions ─────────────────────────────────────────────────────
    // Manifest permissions are auto-registered. Define extra ones here:
    permissions.define({
      id: 'my-addon.vip',
      description: 'Access VIP features',
      defaultDiscordPermissions: [],  // no Discord perm required by default
    });

    // ── Commands ─────────────────────────────────────────────────────────
    // Use Discord.js SlashCommandBuilder directly.
    // OmniCommand adds: permission, cooldown, guildOnly, autocomplete.

    commands.register({
      data: new SlashCommandBuilder()
        .setName('my-command')
        .setDescription('An example command')
        .addStringOption(opt =>
          opt.setName('action').setDescription('What to do').setRequired(true)
            .addChoices(
              { name: 'Start', value: 'start' },
              { name: 'Stop', value: 'stop' },
            ),
        )
        .addChannelOption(opt =>
          opt.setName('target').setDescription('Target channel')
            .addChannelTypes(ChannelType.GuildText),
        ),
      permission: 'my-addon.manage',  // requires this perm node
      cooldown: 3,                     // 3 second cooldown per user
      guildOnly: true,                 // no DMs
      execute: async (interaction) => {
        const action = interaction.options.getString('action', true);
        const channel = interaction.options.getChannel('target');

        if (action === 'start') {
          const embed = this.context.embeds.success(
            'Started',
            `Running in ${channel ? `<#${channel.id}>` : 'this channel'}.`,
          );
          await interaction.reply({ embeds: [embed] });
        } else {
          const embed = this.context.embeds.warning('Stopped', 'The process has been stopped.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      },
    });

    // Command with autocomplete:
    commands.register({
      data: new SlashCommandBuilder()
        .setName('my-search')
        .setDescription('Search for something')
        .addStringOption(opt =>
          opt.setName('query').setDescription('Search query')
            .setRequired(true).setAutocomplete(true),
        ),
      execute: async (interaction) => {
        const query = interaction.options.getString('query', true);
        await interaction.reply(`You searched for: ${query}`);
      },
      autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused();
        const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
        const filtered = items.filter(i => i.startsWith(focused.toLowerCase()));
        await interaction.respond(
          filtered.slice(0, 25).map(item => ({ name: item, value: item })),
        );
      },
    });

    logger.info('My addon loaded');
  }

  // onEnable — called after ALL addons are loaded.
  // Safe to use inter-addon APIs here. Start intervals, watchers, etc.
  async onEnable(): Promise<void> {
    const { events, addons, logger } = this.context;

    // ── Events ──────────────────────────────────────────────────────────
    // Listen to any Discord.js event (fully typed).
    // Gate guild events with modules.isEnabled() so server admins can
    // disable your addon per-guild via /module disable.
    events.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (!(await this.context.modules.isEnabled(message.guild.id))) return;

      if (message.content === '!ping') {
        await message.reply('Pong!');
      }
    });

    // Listen to custom Omni events (emitted by core or other addons):
    events.on('addon:enabled', (addonId) => {
      logger.debug(`Noticed addon enabled: ${addonId}`);
    });

    // Emit your own custom events (extend OmniEvents via module augmentation):
    // events.emit('my-addon:itemAdded', itemName);

    // ── Inter-Addon API ─────────────────────────────────────────────────
    // Expose an API so other addons can call your functions:
    const items: string[] = [];

    addons.expose<MyAddonAPI>({
      getItemCount: () => items.length,
      addItem: (name: string) => {
        items.push(name);
        logger.info(`Item added: ${name}`);
      },
    });

    // Consume another addon's API (check if it exists first):
    if (addons.isEnabled('economy')) {
      const economyAPI = addons.getAPI<{ getBalance(userId: string): number }>('economy');
      if (economyAPI) {
        logger.info('Economy integration available');
      }
    }

    // ── Embeds ──────────────────────────────────────────────────────────
    // Four branded embed types: info, success, warning, error.
    // All include the "Powered by Omni" footer and timestamp.
    // const embed = this.context.embeds.info('Title', 'Description');

    // ── Database ────────────────────────────────────────────────────────
    // Omni supports both SQLite and MySQL. Use `context.db.driver` to
    // pick the correct Drizzle schema for the active database.
    // Tables MUST be prefixed with your addon ID: "my-addon_tablename"
    //
    // import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
    // import { mysqlTable, varchar, int, serial } from 'drizzle-orm/mysql-core';
    //
    // const sqliteItems = sqliteTable('my-addon_items', {
    //   id: integer('id').primaryKey({ autoIncrement: true }),
    //   name: text('name').notNull(),
    // });
    // const mysqlItems = mysqlTable('my-addon_items', {
    //   id: serial('id').primaryKey(),
    //   name: varchar('name', { length: 255 }).notNull(),
    // });
    //
    // const itemsTable = this.context.db.driver === 'mysql' ? mysqlItems : sqliteItems;
    // this.context.db.registerSchema(itemsTable);
    //
    // // IMPORTANT: Always use `await` on queries for cross-driver compatibility.
    // const db = this.context.db.getDb();
    // const rows = await (db as any).select().from(itemsTable);

    // ── Permissions ─────────────────────────────────────────────────────
    // Check permissions programmatically (not just on commands):
    // const canManage = await this.context.permissions.check(guildId, userId, 'manage');

    logger.info('My addon enabled');
  }

  // onDisable — called when the addon is disabled or the bot shuts down.
  // Events and commands are auto-cleaned by the core. Only clean up your own
  // resources here (intervals, external connections, etc).
  async onDisable(): Promise<void> {
    this.context.logger.info('My addon disabled');
  }
}
