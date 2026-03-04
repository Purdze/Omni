import { REST, Routes } from 'discord.js';
import type { OmniCommand } from '../types/command';
import type { AddonLogger } from '../types/addon';

/**
 * Deploys registered slash commands to Discord via the REST API.
 *
 * When a `devGuildId` is provided the commands are deployed as guild
 * commands (instant update). Otherwise they are deployed globally,
 * which may take up to an hour to propagate.
 */
export class CommandDeployer {
  private readonly logger: AddonLogger;

  constructor(logger: AddonLogger) {
    this.logger = logger;
  }

  async deploy(
    commands: OmniCommand[],
    clientId: string,
    token: string,
    devGuildId?: string,
  ): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(token);
    const body = commands.map((cmd) => cmd.data.toJSON());

    try {
      if (devGuildId) {
        this.logger.info(
          `Deploying ${body.length} command(s) to dev guild ${devGuildId}...`,
        );

        await rest.put(
          Routes.applicationGuildCommands(clientId, devGuildId),
          { body },
        );

        this.logger.info(
          `Successfully deployed ${body.length} command(s) to dev guild.`,
        );
      } else {
        this.logger.info(
          `Deploying ${body.length} command(s) globally (may take up to 1 hour to propagate)...`,
        );

        await rest.put(Routes.applicationCommands(clientId), { body });

        this.logger.info(
          `Successfully deployed ${body.length} command(s) globally.`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to deploy slash commands', error as Error);
      throw error;
    }
  }
}
