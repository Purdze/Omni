import type { TextChannel } from 'discord.js';
import type { AddonContext } from '@omni/core';
import { eq, and } from 'drizzle-orm';
import { canModerate } from './hierarchy';
import { parseDuration, formatDuration } from './duration';
import { type AutoModConfig, type PunishmentStep, getMessages, msg, findPunishment } from './common';

type ModerationAPI = {
  getWarningCount(guildId: string, userId: string): Promise<number>;
  getHistory(guildId: string, userId: string, limit?: number): Promise<any[]>;
  addWarning(guildId: string, targetId: string, moderatorId: string, reason: string): Promise<number>;
};

export interface AutoModTables {
  violations: any;
  filters: any;
}

async function getViolationCount(
  context: AddonContext,
  tables: AutoModTables,
  guildId: string,
  userId: string,
): Promise<number> {
  const db = context.db.getDb() as any;
  const rows = await db.select().from(tables.violations).where(
    and(eq(tables.violations.guildId, guildId), eq(tables.violations.userId, userId)),
  );
  return rows.length;
}

export async function executeEscalation(
  context: AddonContext,
  tables: AutoModTables,
  guildId: string,
  userId: string,
  filterType: string,
  details: string,
): Promise<string> {
  const config = context.config.getAll() as unknown as AutoModConfig;
  const count = await getViolationCount(context, tables, guildId, userId) + 1;
  const step = findPunishment(config.punishments ?? [], count);
  const action = step ? step.action : 'warn';

  const actionTaken = await applyPunishment(context, guildId, userId, action, step?.duration, filterType, details);

  const db = context.db.getDb() as any;
  await db.insert(tables.violations).values({
    guildId,
    userId,
    filterType,
    details,
    actionTaken,
    createdAt: Date.now(),
  });

  return actionTaken;
}

async function applyPunishment(
  context: AddonContext,
  guildId: string,
  userId: string,
  action: string,
  duration: string | undefined,
  filterType: string,
  details: string,
): Promise<string> {
  const reason = `Auto-mod: ${filterType} - ${details}`;
  const botId = context.client.user!.id;

  try {
    const guild = await context.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    const botMember = guild.members.me!;

    if (member && action !== 'warn') {
      const check = canModerate(botMember, member, botMember);
      if (!check.allowed) {
        return applyWarn(context, guildId, userId, reason, botId);
      }
    }

    const messages = getMessages(context);

    switch (action) {
      case 'mute': {
        if (!member) return applyWarn(context, guildId, userId, reason, botId);
        const durationMs = duration ? parseDuration(duration) : null;
        if (!durationMs) return applyWarn(context, guildId, userId, reason, botId);
        await member.timeout(durationMs, reason);
        context.events.emit('moderation:mute', guildId, userId, botId, reason, durationMs);
        try {
          await member.send({ content: msg(messages, 'punishmentMute', {
            duration: formatDuration(durationMs), reason: filterType,
          }) });
        } catch {}
        await sendLog(context, guildId, 'Auto-Mod Mute', userId, reason, formatDuration(durationMs));
        return 'mute';
      }

      case 'kick': {
        if (!member) return applyWarn(context, guildId, userId, reason, botId);
        try {
          await member.send({ content: msg(messages, 'punishmentKick', { reason: filterType }) });
        } catch {}
        await member.kick(reason);
        context.events.emit('moderation:kick', guildId, userId, botId, reason);
        await sendLog(context, guildId, 'Auto-Mod Kick', userId, reason);
        return 'kick';
      }

      case 'ban': {
        try {
          if (member) {
            await member.send({ content: msg(messages, 'punishmentBan', { reason: filterType }) });
          }
        } catch {}
        await guild.members.ban(userId, { reason });
        context.events.emit('moderation:ban', guildId, userId, botId, reason);
        await sendLog(context, guildId, 'Auto-Mod Ban', userId, reason);
        return 'ban';
      }

      case 'warn':
      default:
        return applyWarn(context, guildId, userId, reason, botId);
    }
  } catch (err) {
    context.logger.warn(`Auto-mod punishment failed (${action}): ${err}`);
    return 'warn';
  }
}

async function applyWarn(
  context: AddonContext,
  guildId: string,
  userId: string,
  reason: string,
  botId: string,
): Promise<string> {
  const modApi = context.addons.getAPI<ModerationAPI>('moderation');
  if (modApi) {
    const count = await modApi.addWarning(guildId, userId, botId, reason);
    context.events.emit('moderation:warn', guildId, userId, botId, reason, count);
  } else {
    context.events.emit('moderation:warn', guildId, userId, botId, reason, 0);
  }

  const messages = getMessages(context);
  try {
    const user = await context.client.users.fetch(userId);
    await user.send({ content: msg(messages, 'punishmentWarn', { reason, count: '0' }) });
  } catch {}

  await sendLog(context, guildId, 'Auto-Mod Warning', userId, reason);
  return 'warn';
}

async function sendLog(
  context: AddonContext,
  guildId: string,
  title: string,
  userId: string,
  reason: string,
  duration?: string,
): Promise<void> {
  const config = context.config.getAll() as unknown as AutoModConfig;
  if (!config.logChannelId) return;

  try {
    const channel = await context.client.channels.fetch(config.logChannelId);
    if (channel && channel.isTextBased()) {
      const fields = [
        { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
        { name: 'Reason', value: reason, inline: false },
      ];
      if (duration) {
        fields.push({ name: 'Duration', value: duration, inline: true });
      }
      const embed = context.embeds.warning(title, '\u200b', { fields, footer: 'Omni Auto-Moderation' });
      await (channel as TextChannel).send({ embeds: [embed] });
    }
  } catch {}
}
