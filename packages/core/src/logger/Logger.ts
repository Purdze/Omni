import chalk from 'chalk';
import type { AddonLogger } from '../types/addon';
import type { OmniConfig } from '../types/config';

const LOG_LEVEL_PRIORITY: Record<OmniConfig['logLevel'], number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly level: OmniConfig['logLevel'];

  constructor(level: OmniConfig['logLevel'] = 'info') {
    this.level = level;
  }

  createLogger(namespace: string): AddonLogger {
    return {
      debug: (message: string, ...args: unknown[]) =>
        this.log('debug', namespace, message, args),
      info: (message: string, ...args: unknown[]) =>
        this.log('info', namespace, message, args),
      warn: (message: string, ...args: unknown[]) =>
        this.log('warn', namespace, message, args),
      error: (message: string, ...args: unknown[]) =>
        this.log('error', namespace, message, args),
    };
  }

  private log(
    level: OmniConfig['logLevel'],
    namespace: string,
    message: string,
    args: unknown[],
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = this.formatPrefix(level, namespace, timestamp);
    const formattedMessage = this.colorize(level, message);

    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

    if (args.length > 0) {
      stream.write(`${prefix} ${formattedMessage} ${this.formatArgs(args)}\n`);
    } else {
      stream.write(`${prefix} ${formattedMessage}\n`);
    }
  }

  private formatPrefix(
    level: OmniConfig['logLevel'],
    namespace: string,
    timestamp: string,
  ): string {
    const ts = chalk.gray(timestamp);
    const lvl = this.colorize(level, level.toUpperCase().padEnd(5));
    const core = chalk.magentaBright('Omni');
    const ns = chalk.cyan(namespace);

    return `${ts} ${lvl} ${chalk.gray('[')}${core}${chalk.gray(']')} ${chalk.gray('[')}${ns}${chalk.gray(']')}`;
  }

  private colorize(level: OmniConfig['logLevel'], text: string): string {
    switch (level) {
      case 'debug':
        return chalk.gray(text);
      case 'info':
        return chalk.blue(text);
      case 'warn':
        return chalk.yellow(text);
      case 'error':
        return chalk.red(text);
    }
  }

  private formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (arg instanceof Error) {
          return arg.stack ?? arg.message;
        }
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
  }
}
