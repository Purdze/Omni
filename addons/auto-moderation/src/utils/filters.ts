import type { Message } from 'discord.js';
import type { AutoModConfig } from './common';

export interface SpamEntry {
  timestamps: number[];
  contents: { text: string; time: number }[];
}

const spamMap = new Map<string, SpamEntry>();
const raidMap = new Map<string, number[]>();

export function clearSpamMap(): void {
  spamMap.clear();
}

export function clearRaidMap(): void {
  raidMap.clear();
}

export function pruneSpamEntries(now: number, maxWindow: number): void {
  const cutoff = now - maxWindow * 1000;
  for (const [key, entry] of spamMap) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    entry.contents = entry.contents.filter(c => c.time > cutoff);
    if (entry.timestamps.length === 0 && entry.contents.length === 0) {
      spamMap.delete(key);
    }
  }
}

export function pruneRaidEntries(now: number, windowSec: number): void {
  const cutoff = now - windowSec * 1000;
  for (const [key, timestamps] of raidMap) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) {
      raidMap.delete(key);
    } else {
      raidMap.set(key, filtered);
    }
  }
}

export interface FilterMatch {
  type: 'word' | 'spam' | 'link' | 'mention';
  details: string;
  shouldDelete: boolean;
}

export function checkWordFilter(
  content: string,
  filters: { filterType: string; pattern: string; enabled: number }[],
  config: AutoModConfig,
): FilterMatch | null {
  if (!config.wordFilterEnabled) return null;

  const lower = content.toLowerCase();

  for (const filter of filters) {
    if (!filter.enabled) continue;

    try {
      if (filter.filterType === 'word') {
        const regex = new RegExp(`\\b${escapeRegex(filter.pattern)}\\b`, 'i');
        if (regex.test(lower)) {
          return {
            type: 'word',
            details: `Matched word: ${filter.pattern}`,
            shouldDelete: config.wordFilterDelete,
          };
        }
      } else if (filter.filterType === 'regex') {
        const regex = new RegExp(filter.pattern, 'i');
        if (regex.test(content)) {
          return {
            type: 'word',
            details: `Matched regex: ${filter.pattern}`,
            shouldDelete: config.wordFilterDelete,
          };
        }
      }
    } catch {}
  }

  return null;
}

export function checkMentionSpam(message: Message, config: AutoModConfig): FilterMatch | null {
  if (!config.spamEnabled) return null;

  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= config.spamMaxMentions) {
    return {
      type: 'mention',
      details: `${mentionCount} mentions (limit: ${config.spamMaxMentions})`,
      shouldDelete: config.spamDeleteMessage,
    };
  }

  return null;
}

export function checkSpam(message: Message, config: AutoModConfig): FilterMatch | null {
  if (!config.spamEnabled) return null;

  const key = `${message.guild!.id}:${message.author.id}`;
  const now = Date.now();

  let entry = spamMap.get(key);
  if (!entry) {
    entry = { timestamps: [], contents: [] };
    spamMap.set(key, entry);
  }

  entry.timestamps.push(now);
  entry.contents.push({ text: message.content, time: now });

  const spamCutoff = now - config.spamMessageWindow * 1000;
  const recentMessages = entry.timestamps.filter(t => t > spamCutoff);
  if (recentMessages.length > config.spamMaxMessages) {
    return {
      type: 'spam',
      details: `${recentMessages.length} messages in ${config.spamMessageWindow}s (limit: ${config.spamMaxMessages})`,
      shouldDelete: config.spamDeleteMessage,
    };
  }

  const dupCutoff = now - config.spamDuplicateWindow * 1000;
  const recentContents = entry.contents.filter(c => c.time > dupCutoff);
  const contentCounts = new Map<string, number>();
  for (const c of recentContents) {
    const count = (contentCounts.get(c.text) ?? 0) + 1;
    contentCounts.set(c.text, count);
    if (count > config.spamMaxDuplicates) {
      return {
        type: 'spam',
        details: `${count} duplicate messages in ${config.spamDuplicateWindow}s (limit: ${config.spamMaxDuplicates})`,
        shouldDelete: config.spamDeleteMessage,
      };
    }
  }

  return null;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i;
const URL_REGEX = /https?:\/\/[^\s<>]+/gi;

export function checkLinkFilter(
  content: string,
  filters: { filterType: string; pattern: string; enabled: number }[],
  config: AutoModConfig,
): FilterMatch | null {
  if (!config.linkFilterEnabled) return null;

  const urls = content.match(URL_REGEX);
  if (!urls || urls.length === 0) return null;

  const allowList = filters
    .filter(f => f.filterType === 'link_allow' && f.enabled)
    .map(f => f.pattern.toLowerCase());

  const blockList = filters
    .filter(f => f.filterType === 'link_block' && f.enabled)
    .map(f => f.pattern.toLowerCase());

  for (const url of urls) {
    const lower = url.toLowerCase();

    if (config.linkAllowImages && IMAGE_EXTENSIONS.test(lower)) continue;

    const domain = extractDomain(lower);

    // Allowlist mode: only allowed domains pass
    if (allowList.length > 0) {
      if (domain && allowList.some(d => domain.endsWith(d))) continue;
      return {
        type: 'link',
        details: `Blocked link: ${url} (not on allowlist)`,
        shouldDelete: config.linkFilterDelete,
      };
    }

    if (blockList.length > 0 && domain && blockList.some(d => domain.endsWith(d))) {
      return {
        type: 'link',
        details: `Blocked link: ${url} (domain blocked)`,
        shouldDelete: config.linkFilterDelete,
      };
    }

    // No lists configured - block all links
    if (allowList.length === 0 && blockList.length === 0) {
      return {
        type: 'link',
        details: `Blocked link: ${url}`,
        shouldDelete: config.linkFilterDelete,
      };
    }
  }

  return null;
}

export function trackJoin(guildId: string, config: AutoModConfig): boolean {
  if (!config.raidEnabled) return false;

  const now = Date.now();
  let timestamps = raidMap.get(guildId);
  if (!timestamps) {
    timestamps = [];
    raidMap.set(guildId, timestamps);
  }

  timestamps.push(now);

  const cutoff = now - config.raidJoinWindow * 1000;
  const recent = timestamps.filter(t => t > cutoff);
  raidMap.set(guildId, recent);

  return recent.length >= config.raidJoinThreshold;
}

function extractDomain(url: string): string | null {
  const match = url.match(/https?:\/\/([^/:\s]+)/i);
  return match ? match[1] : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
