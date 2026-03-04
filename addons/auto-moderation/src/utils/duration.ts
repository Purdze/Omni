const UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const FORMAT_UNITS: [number, string, string][] = [
  [604_800_000, 'week', 'weeks'],
  [86_400_000, 'day', 'days'],
  [3_600_000, 'hour', 'hours'],
  [60_000, 'minute', 'minutes'],
  [1000, 'second', 'seconds'],
];

export function parseDuration(input: string): number | null {
  const matches = input.match(/(\d+)\s*([smhdw])/gi);
  if (!matches || matches.length === 0) return null;

  let total = 0;
  for (const match of matches) {
    const result = /(\d+)\s*([smhdw])/i.exec(match);
    if (!result) continue;
    const value = parseInt(result[1], 10);
    const unit = result[2].toLowerCase();
    if (!(unit in UNITS)) return null;
    total += value * UNITS[unit];
  }

  return total > 0 ? total : null;
}

export function formatDuration(ms: number): string {
  const parts: string[] = [];
  let remaining = ms;

  for (const [unitMs, singular, plural] of FORMAT_UNITS) {
    const count = Math.floor(remaining / unitMs);
    if (count > 0) {
      parts.push(`${count} ${count === 1 ? singular : plural}`);
      remaining -= count * unitMs;
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0 seconds';
}
