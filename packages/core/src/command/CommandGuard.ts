import type { ChatInputCommandInteraction } from 'discord.js';
import type { OmniCommand } from '../types/command';
import type { PermissionAccessor } from '../types/permission';
import type { AddonLogger } from '../types/addon';
import type { CommandManager } from './CommandManager';
import type { ModuleManager } from '../module/ModuleManager';

/** Result of a pre-execution guard check. */
export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Pre-execution checks that run before every command handler.
 *
 * Checks are evaluated in order: module enabled, guildOnly, cooldown, then permissions.
 */
export class CommandGuard {
  /** Outer key: command name, inner key: user ID, value: expiry timestamp (ms). */
  private readonly cooldowns = new Map<string, Map<string, number>>();

  private readonly permissions: PermissionAccessor;
  private readonly commandManager: CommandManager;
  private readonly moduleManager: ModuleManager;
  private readonly logger: AddonLogger;

  constructor(
    permissions: PermissionAccessor,
    commandManager: CommandManager,
    moduleManager: ModuleManager,
    logger: AddonLogger,
  ) {
    this.permissions = permissions;
    this.commandManager = commandManager;
    this.moduleManager = moduleManager;
    this.logger = logger;
  }

  async check(
    interaction: ChatInputCommandInteraction,
    command: OmniCommand,
  ): Promise<GuardResult> {
    if (interaction.guild) {
      const owner = this.commandManager.findOwner(command.data.name);
      if (owner && owner !== 'core') {
        const enabled = await this.moduleManager.isEnabled(interaction.guild.id, owner);
        if (!enabled) {
          return {
            allowed: false,
            reason: `The **${owner}** module is disabled in this server.`,
          };
        }
      }
    }

    const guildOnly = command.guildOnly ?? true;
    if (guildOnly && !interaction.guild) {
      return {
        allowed: false,
        reason: 'This command can only be used in a server.',
      };
    }

    const cooldownSeconds = command.cooldown ?? 0;
    if (cooldownSeconds > 0) {
      const cooldownResult = this.checkCooldown(
        command.data.name,
        interaction.user.id,
      );
      if (!cooldownResult.allowed) {
        return cooldownResult;
      }
    }

    if (command.permission && interaction.guild) {
      const hasPermission = await this.permissions.check(
        interaction.guild.id,
        interaction.user.id,
        command.permission,
      );

      if (!hasPermission) {
        this.logger.debug(
          `User ${interaction.user.id} denied permission "${command.permission}" ` +
            `for command "/${command.data.name}" in guild ${interaction.guild.id}`,
        );
        return {
          allowed: false,
          reason: `You do not have the required permission: \`${command.permission}\`.`,
        };
      }
    }

    if (cooldownSeconds > 0) {
      this.applyCooldown(command.data.name, interaction.user.id, cooldownSeconds);
    }

    return { allowed: true };
  }

  clearCooldowns(commandName: string): void {
    this.cooldowns.delete(commandName);
  }

  clearAllCooldowns(): void {
    this.cooldowns.clear();
  }

  private checkCooldown(
    commandName: string,
    userId: string,
  ): GuardResult {
    const userMap = this.cooldowns.get(commandName);
    if (!userMap) {
      return { allowed: true };
    }

    const expiresAt = userMap.get(userId);
    if (expiresAt === undefined) {
      return { allowed: true };
    }

    const now = Date.now();
    if (now < expiresAt) {
      const remainingSeconds = Math.ceil((expiresAt - now) / 1000);
      return {
        allowed: false,
        reason:
          `This command is on cooldown. Please wait **${remainingSeconds}** ` +
          `second${remainingSeconds === 1 ? '' : 's'} before using it again.`,
      };
    }

    userMap.delete(userId);
    if (userMap.size === 0) {
      this.cooldowns.delete(commandName);
    }

    return { allowed: true };
  }

  private applyCooldown(
    commandName: string,
    userId: string,
    cooldownSeconds: number,
  ): void {
    let userMap = this.cooldowns.get(commandName);
    if (!userMap) {
      userMap = new Map();
      this.cooldowns.set(commandName, userMap);
    }
    userMap.set(userId, Date.now() + cooldownSeconds * 1000);
  }
}
