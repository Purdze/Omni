import {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActivityType,
  type Interaction,
} from 'discord.js';
import { Logger } from './logger/Logger';
import { ConfigManager } from './config/ConfigManager';
import { DatabaseManager } from './database/DatabaseManager';
import { EventBus } from './event/EventBus';
import { CommandManager } from './command/CommandManager';
import { CommandDeployer } from './command/CommandDeployer';
import { CommandGuard } from './command/CommandGuard';
import { PermissionManager } from './permission/PermissionManager';
import { AddonConfigManager } from './config/AddonConfigManager';
import { BotConfigManager } from './config/BotConfigManager';
import { AddonDatabase } from './database/AddonDatabase';
import { AddonManager } from './addon/AddonManager';
import { EmbedFactory } from './embed/EmbedFactory';
import { ModuleManager } from './module/ModuleManager';
import type { OmniConfig } from './types/config';
import * as path from 'path';

export class OmniBot {
  private client!: Client;
  private config!: OmniConfig;
  private logger!: Logger;
  private databaseManager!: DatabaseManager;
  private addonManager!: AddonManager;
  private commandManager!: CommandManager;
  private commandGuard!: CommandGuard;
  private embedFactory!: EmbedFactory;
  private moduleManager!: ModuleManager;
  private permissionManager!: PermissionManager;
  private commandLog!: ReturnType<Logger['createLogger']>;
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async start(): Promise<void> {
    const configManager = new ConfigManager();
    try {
      this.config = configManager.load(this.projectRoot);
    } catch (err: any) {
      if (/missing required environment/i.test(err?.message ?? '')) {
        console.error(`\n  [Omni] ${err.message}\n`);
        err._omniHandled = true;
      }
      throw err;
    }

    this.logger = new Logger(this.config.logLevel);
    const log = this.logger.createLogger('Core');
    this.commandLog = this.logger.createLogger('CommandHandler');

    log.info('Starting Omni...');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.databaseManager = new DatabaseManager(
      this.config.db,
      this.logger.createLogger('Database'),
    );

    try {
      await this.databaseManager.connect();
    } catch (err: any) {
      this.handleDatabaseError(log, err);
    }

    const eventBus = new EventBus(
      this.client,
      this.logger.createLogger('EventBus'),
    );

    this.commandManager = new CommandManager(
      this.logger.createLogger('CommandManager'),
    );

    const commandDeployer = new CommandDeployer(
      this.logger.createLogger('CommandDeployer'),
    );

    this.permissionManager = new PermissionManager(
      this.client,
      this.databaseManager,
      this.logger.createLogger('PermissionManager'),
    );

    const botConfigManager = new BotConfigManager(this.projectRoot);
    const botConfig = botConfigManager.load();
    log.debug(`Loaded bot config (brand color: ${botConfig.branding.color})`);

    this.embedFactory = new EmbedFactory(botConfig.branding);

    this.moduleManager = new ModuleManager(
      this.databaseManager,
      this.logger.createLogger('ModuleManager'),
    );

    this.commandGuard = new CommandGuard(
      this.permissionManager.createAccessor('core'),
      this.commandManager,
      this.moduleManager,
      this.logger.createLogger('CommandGuard'),
    );

    const addonConfigManager = new AddonConfigManager(
      path.join(this.projectRoot, 'config', 'addons'),
      this.logger.createLogger('AddonConfig'),
    );

    const addonDatabase = new AddonDatabase(
      this.logger.createLogger('AddonDatabase'),
    );

    this.addonManager = new AddonManager({
      client: this.client,
      logger: this.logger,
      eventBus,
      commandManager: this.commandManager,
      commandDeployer,
      permissionManager: this.permissionManager,
      addonConfigManager,
      addonDatabase,
      databaseManager: this.databaseManager,
      embedFactory: this.embedFactory,
      moduleManager: this.moduleManager,
      projectRoot: this.projectRoot,
      token: this.config.token,
      clientId: this.config.clientId,
      devGuildId: this.config.devGuildId,
    });

    this.registerModuleCommand();
    this.registerPermissionsCommand();

    this.client.on(Events.InteractionCreate, (interaction) => {
      this.handleInteraction(interaction).catch((err) => {
        log.error('Unhandled error in interaction handler', err);
      });
    });

    this.client.once(Events.ClientReady, async (readyClient) => {
      log.info(`Logged in as ${readyClient.user.tag}`);

      const activityTypeMap = {
        Playing: ActivityType.Playing,
        Listening: ActivityType.Listening,
        Watching: ActivityType.Watching,
        Competing: ActivityType.Competing,
      } as const;

      readyClient.user.setPresence({
        status: botConfig.presence.status,
        activities: [{
          type: activityTypeMap[botConfig.presence.activityType] ?? ActivityType.Playing,
          name: botConfig.presence.activityText,
        }],
      });

      await this.addonManager.startAll();
      log.info('Omni is ready!');
    });

    this.setupShutdown(log);

    try {
      await this.client.login(this.config.token);
    } catch (err: any) {
      this.handleLoginError(log, err);
    }
  }

  async stop(): Promise<void> {
    const log = this.logger.createLogger('Core');
    log.info('Shutting down Omni...');

    await this.addonManager.disableAll();
    this.client.destroy();
    await this.databaseManager.close();

    log.info('Omni has been shut down');
  }

  getAddonManager(): AddonManager {
    return this.addonManager;
  }

  private async replyError(
    interaction: { reply: (opts: any) => Promise<any>; followUp: (opts: any) => Promise<any>; replied: boolean; deferred: boolean },
    title: string,
    message: string,
  ): Promise<void> {
    const embed = this.embedFactory.error(title, message);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  private registerModuleCommand(): void {
    const data = new SlashCommandBuilder()
      .setName('module')
      .setDescription('Enable or disable modules for this server')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('List all modules and their status'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('enable')
          .setDescription('Enable a module in this server')
          .addStringOption((opt) =>
            opt
              .setName('name')
              .setDescription('The module to enable')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('disable')
          .setDescription('Disable a module in this server')
          .addStringOption((opt) =>
            opt
              .setName('name')
              .setDescription('The module to disable')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      );

    const getEnabledAddons = () =>
      this.addonManager.getRegistry().getAll().filter((a) => a.state === 'ENABLED');

    this.commandManager.register('core', {
      data,
      guildOnly: true,
      execute: async (interaction) => {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild!.id;
        const allAddons = getEnabledAddons();

        if (sub === 'list') {
          const disabledSet = new Set(await this.moduleManager.getDisabledModules(guildId));
          const lines = allAddons.map((a) => {
            const status = disabledSet.has(a.manifest.id) ? '\u274c Disabled' : '\u2705 Enabled';
            return `**${a.manifest.name}** (\`${a.manifest.id}\`) - ${status}`;
          });

          const embed = this.embedFactory.info(
            'Module Status',
            lines.length > 0 ? lines.join('\n') : 'No modules loaded.',
          );
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        const name = interaction.options.getString('name', true);
        const addon = allAddons.find((a) => a.manifest.id === name);
        if (!addon) {
          await interaction.reply({
            embeds: [this.embedFactory.error('Not Found', `No module found with ID \`${name}\`.`)],
            ephemeral: true,
          });
          return;
        }

        const enabling = sub === 'enable';
        await (enabling
          ? this.moduleManager.enable(guildId, name)
          : this.moduleManager.disable(guildId, name));

        const embed = enabling
          ? this.embedFactory.success('Module Enabled', `**${addon.manifest.name}** is now enabled in this server.`)
          : this.embedFactory.warning('Module Disabled', `**${addon.manifest.name}** is now disabled in this server.`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      },
      autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = getEnabledAddons()
          .filter(
            (a) =>
              a.manifest.id.toLowerCase().includes(focused) ||
              a.manifest.name.toLowerCase().includes(focused),
          )
          .slice(0, 25)
          .map((a) => ({ name: a.manifest.name, value: a.manifest.id }));

        await interaction.respond(choices);
      },
    });
  }

  private registerPermissionsCommand(): void {
    const roleAddonNodeSubcommand = (name: string, description: string) =>
      (sub: any) =>
        sub
          .setName(name)
          .setDescription(description)
          .addRoleOption((opt: any) =>
            opt.setName('role').setDescription('The target role').setRequired(true),
          )
          .addStringOption((opt: any) =>
            opt.setName('addon').setDescription('The addon that owns the permission').setRequired(true).setAutocomplete(true),
          )
          .addStringOption((opt: any) =>
            opt.setName('node').setDescription('The permission node').setRequired(true).setAutocomplete(true),
          );

    const data = new SlashCommandBuilder()
      .setName('permissions')
      .setDescription('Manage permission overrides for roles')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand(roleAddonNodeSubcommand('grant', 'Grant a permission node to a role'))
      .addSubcommand(roleAddonNodeSubcommand('deny', 'Deny a permission node for a role'))
      .addSubcommand(roleAddonNodeSubcommand('reset', 'Remove a permission override for a role'))
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('List all permission overrides')
          .addRoleOption((opt) =>
            opt.setName('role').setDescription('Filter by role (optional)').setRequired(false),
          ),
      );

    this.commandManager.register('core', {
      data,
      guildOnly: true,
      execute: async (interaction) => {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild!.id;

        if (sub === 'list') {
          const role = interaction.options.getRole('role');
          const overrides = await this.permissionManager.listOverrides(guildId, role?.id);

          if (overrides.length === 0) {
            const desc = role
              ? `No permission overrides found for <@&${role.id}>.`
              : 'No permission overrides found in this server.';
            await interaction.reply({ embeds: [this.embedFactory.info('Permission Overrides', desc)], ephemeral: true });
            return;
          }

          const lines = overrides.map(
            (o) => `<@&${o.roleId}> - \`${o.permissionNode}\` - ${o.granted ? '\u2705 Granted' : '\u274c Denied'}`,
          );
          const embed = this.embedFactory.info(
            'Permission Overrides',
            lines.join('\n'),
          );
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        const role = interaction.options.getRole('role', true);
        const addonId = interaction.options.getString('addon', true);
        const nodeName = interaction.options.getString('node', true);
        const fullNode = `${addonId}.${nodeName}`;

        const definition = this.permissionManager.getDefinition(fullNode);
        if (!definition) {
          await interaction.reply({
            embeds: [this.embedFactory.error('Invalid Node', `Permission node \`${fullNode}\` is not registered.`)],
            ephemeral: true,
          });
          return;
        }

        const actions: Record<string, { action: () => Promise<void>; embed: () => ReturnType<EmbedFactory['success']> }> = {
          grant: {
            action: () => this.permissionManager.grant(guildId, role.id, fullNode),
            embed: () => this.embedFactory.success('Permission Granted', `Granted \`${fullNode}\` to <@&${role.id}>.`),
          },
          deny: {
            action: () => this.permissionManager.deny(guildId, role.id, fullNode),
            embed: () => this.embedFactory.warning('Permission Denied', `Denied \`${fullNode}\` for <@&${role.id}>.`),
          },
          reset: {
            action: () => this.permissionManager.reset(guildId, role.id, fullNode),
            embed: () => this.embedFactory.info('Permission Reset', `Removed override for \`${fullNode}\` on <@&${role.id}>.`),
          },
        };

        const { action, embed } = actions[sub]!;
        await action();
        await interaction.reply({ embeds: [embed()], ephemeral: true });
      },
      autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused(true);
        const allDefs = this.permissionManager.getDefinitions();

        if (focused.name === 'addon') {
          const addonIds = [...new Set(allDefs.map((d) => d.id.split('.')[0]))];
          const filtered = addonIds
            .filter((id) => id.toLowerCase().includes(focused.value.toLowerCase()))
            .slice(0, 25)
            .map((id) => ({ name: id, value: id }));
          await interaction.respond(filtered);
        } else if (focused.name === 'node') {
          const selectedAddon = interaction.options.getString('addon') ?? '';
          const filtered = allDefs
            .filter((d) => d.id.startsWith(`${selectedAddon}.`))
            .filter((d) => {
              const shortName = d.id.slice(selectedAddon.length + 1);
              return shortName.toLowerCase().includes(focused.value.toLowerCase());
            })
            .slice(0, 25)
            .map((d) => {
              const shortName = d.id.slice(selectedAddon.length + 1);
              return { name: `${shortName} - ${d.description}`, value: shortName };
            });
          await interaction.respond(filtered);
        }
      },
    });
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand()) {
      const command = this.commandManager.get(interaction.commandName);
      if (!command) return;

      const guardResult = await this.commandGuard.check(interaction, command);
      if (!guardResult.allowed) {
        await this.replyError(interaction, 'Command Denied', guardResult.reason!);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        this.commandLog.error(`Error executing /${interaction.commandName}`, error as Error);
        await this.replyError(interaction, 'Command Error', 'An unexpected error occurred while running this command.');
      }
    } else if (interaction.isAutocomplete()) {
      const command = this.commandManager.get(interaction.commandName);
      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        this.commandLog.error(`Error in autocomplete for /${interaction.commandName}`, error as Error);
      }
    }
  }

  private setupShutdown(log: ReturnType<Logger['createLogger']>): void {
    let shuttingDown = false;

    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;

      log.info('Received shutdown signal');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    process.on('uncaughtException', (error) => {
      log.error('Uncaught exception', error);
    });

    process.on('unhandledRejection', (reason) => {
      log.error('Unhandled rejection', reason as Error);
    });
  }

  private startupHint(log: ReturnType<Logger['createLogger']>, err: any, message: string, steps: string[]): never {
    log.error(`${message}\n\n${steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`);
    err._omniHandled = true;
    throw err;
  }

  private handleDatabaseError(log: ReturnType<Logger['createLogger']>, err: any): never {
    const msg = err?.message ?? '';

    if (/could not locate the bindings file/i.test(msg) || /native module/i.test(msg)) {
      this.startupHint(log, err, 'The better-sqlite3 native module is not built for your platform.', [
        'Run: pnpm rebuild better-sqlite3',
        'If that fails, ensure you have build tools installed:\n' +
        '     - Windows: npm install -g windows-build-tools\n' +
        '     - macOS: xcode-select --install\n' +
        '     - Linux: sudo apt install build-essential python3',
        'Restart Omni',
      ]);
    }

    if (/ECONNREFUSED/i.test(msg) || /ENOTFOUND/i.test(msg) || /access denied/i.test(msg)) {
      this.startupHint(log, err, 'Could not connect to the MySQL database.', [
        'Verify the database server is running',
        'Check your .env file: OMNI_DB_HOST, OMNI_DB_PORT, OMNI_DB_USER, OMNI_DB_PASSWORD, OMNI_DB_NAME',
        'Ensure the database user has access to the specified database',
        'To switch to SQLite instead, set OMNI_DB_DRIVER=sqlite in .env',
      ]);
    }

    if (/mysql2.*not installed/i.test(msg)) {
      this.startupHint(log, err, 'MySQL driver selected but the mysql2 package is not installed.', [
        'Install it: pnpm add mysql2',
        'Or switch to SQLite: set OMNI_DB_DRIVER=sqlite in .env',
      ]);
    }

    log.error(`Database connection failed: ${msg}`);
    throw err;
  }

  private handleLoginError(log: ReturnType<Logger['createLogger']>, err: any): never {
    const msg = err?.message ?? '';
    const code = err?.code;
    const hint = this.startupHint.bind(this, log, err);

    if (code === 4014 || /disallowed intents/i.test(msg)) {
      hint('Discord rejected the connection due to disallowed intents.', [
        'Go to https://discord.com/developers/applications',
        'Select your bot application',
        'Navigate to Bot → Privileged Gateway Intents',
        'Enable: Message Content Intent, Server Members Intent, Presence Intent',
        'Save and restart Omni',
      ]);
    }

    if (code === 4004 || code === 'TokenInvalid' || /invalid token/i.test(msg) || /authentication failed/i.test(msg)) {
      hint('The bot token is invalid or has been reset.', [
        'Go to https://discord.com/developers/applications',
        'Select your bot → Bot → Reset Token',
        'Copy the new token into your .env file as OMNI_TOKEN=<token>',
        'Restart Omni',
      ]);
    }

    if (code === 4013 || /invalid intents/i.test(msg)) {
      hint('The bot requested invalid gateway intents.', [
        'This is likely a bug in Omni - please report it at https://github.com/your-org/omni/issues',
        'As a workaround, check that your discord.js version is up to date: pnpm update discord.js',
      ]);
    }

    if (code === 4011 || /sharding required/i.test(msg)) {
      hint('Your bot is in too many servers and requires sharding.', [
        'This means your bot has joined over 2,500 servers',
        'Sharding support is not yet available in Omni',
        'See https://discordjs.guide/sharding/ for manual setup',
      ]);
    }

    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      hint('Could not reach Discord - DNS resolution failed.', [
        'Check your internet connection',
        'If behind a proxy, set the HTTPS_PROXY environment variable',
        'Try again in a few moments',
      ]);
    }

    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
      hint('Could not connect to Discord - the connection was refused or timed out.', [
        'Check your internet connection and firewall settings',
        'Discord may be experiencing an outage - check https://discordstatus.com',
        'If behind a proxy, set the HTTPS_PROXY environment variable',
      ]);
    }

    if (err?.status >= 500 || /50[0-9]/i.test(code?.toString() ?? '')) {
      hint('Discord returned a server error (5xx).', [
        'Discord may be experiencing an outage - check https://discordstatus.com',
        'Wait a few minutes and try again',
      ]);
    }

    log.error(`Failed to connect to Discord: ${msg}`);
    throw err;
  }
}
