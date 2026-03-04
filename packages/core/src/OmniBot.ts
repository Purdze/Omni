import { Client, GatewayIntentBits, Events, type Interaction } from 'discord.js';
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

    this.commandGuard = new CommandGuard(
      permissionManager.createAccessor('core'),
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
      projectRoot: this.projectRoot,
      token: this.config.token,
      clientId: this.config.clientId,
      devGuildId: this.config.devGuildId,
    });

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
