import {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  PermissionFlagsBits,
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
  private commandLog!: ReturnType<Logger['createLogger']>;
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async start(): Promise<void> {
    const configManager = new ConfigManager();
    this.config = configManager.load(this.projectRoot);

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
    await this.databaseManager.connect();

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

    const permissionManager = new PermissionManager(
      this.client,
      this.databaseManager,
      this.logger.createLogger('PermissionManager'),
    );

    this.embedFactory = new EmbedFactory();

    this.moduleManager = new ModuleManager(
      this.databaseManager,
      this.logger.createLogger('ModuleManager'),
    );

    this.commandGuard = new CommandGuard(
      permissionManager.createAccessor('core'),
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
      permissionManager,
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

    this.client.on(Events.InteractionCreate, (interaction) => {
      this.handleInteraction(interaction).catch((err) => {
        log.error('Unhandled error in interaction handler', err);
      });
    });

    this.client.once(Events.ClientReady, async (readyClient) => {
      log.info(`Logged in as ${readyClient.user.tag}`);
      await this.addonManager.startAll();
      log.info('Omni is ready!');
    });

    this.setupShutdown(log);
    await this.client.login(this.config.token);
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
            return `**${a.manifest.name}** (\`${a.manifest.id}\`) — ${status}`;
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
}
