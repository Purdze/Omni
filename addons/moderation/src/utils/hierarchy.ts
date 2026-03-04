import type { GuildMember } from 'discord.js';

export function canModerate(
  moderator: GuildMember,
  target: GuildMember,
  botMember: GuildMember,
): { allowed: boolean; reason?: string } {
  if (moderator.id === target.id) {
    return { allowed: false, reason: 'You cannot moderate yourself.' };
  }

  if (target.id === target.guild.ownerId) {
    return { allowed: false, reason: 'You cannot moderate the server owner.' };
  }

  if (target.roles.highest.position >= moderator.roles.highest.position && moderator.id !== moderator.guild.ownerId) {
    return { allowed: false, reason: 'You cannot moderate a member with an equal or higher role.' };
  }

  if (target.roles.highest.position >= botMember.roles.highest.position) {
    return { allowed: false, reason: 'I cannot moderate a member with an equal or higher role than mine.' };
  }

  return { allowed: true };
}
