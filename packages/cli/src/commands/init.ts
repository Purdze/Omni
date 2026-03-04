import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

function ensureDir(dir: string, label: string): void {
  if (fs.existsSync(dir)) {
    console.log(chalk.yellow('  exists  ') + chalk.gray(label + '/'));
  } else {
    fs.mkdirSync(dir, { recursive: true });
    console.log(chalk.green('  created ') + chalk.gray(label + '/'));
  }
}

function ensureFile(filePath: string, content: string, label: string): void {
  if (fs.existsSync(filePath)) {
    console.log(chalk.yellow('  exists  ') + chalk.gray(label));
  } else {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(chalk.green('  created ') + chalk.gray(label));
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new Omni bot project')
    .action(() => {
      const root = process.cwd();

      console.log(chalk.blue.bold('\n  Omni — Initializing project...\n'));

      const dirs = [
        'addons',
        'config',
        path.join('config', 'addons'),
        'data',
      ];

      for (const dir of dirs) {
        ensureDir(path.resolve(root, dir), dir);
      }

      const envPath = path.resolve(root, '.env');
      const envExamplePath = path.resolve(root, '.env.example');

      if (!fs.existsSync(envPath)) {
        if (fs.existsSync(envExamplePath)) {
          fs.copyFileSync(envExamplePath, envPath);
          console.log(chalk.green('  created ') + chalk.gray('.env (from .env.example)'));
        } else {
          const envContent = [
            '# Discord Bot Token (required)',
            'DISCORD_TOKEN=your-bot-token-here',
            '',
            '# Discord Application ID (required)',
            'DISCORD_CLIENT_ID=your-client-id-here',
            '',
            '# Guild ID for development (optional — deploys commands instantly to this guild)',
            'DISCORD_DEV_GUILD_ID=',
            '',
            '# Log level: debug | info | warn | error',
            'LOG_LEVEL=info',
            '',
          ].join('\n');
          ensureFile(envPath, envContent, '.env');
        }
      } else {
        console.log(chalk.yellow('  exists  ') + chalk.gray('.env'));
      }

      const configContent = `export default {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  devGuildId: process.env.DISCORD_DEV_GUILD_ID,
  logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
};
`;
      ensureFile(path.resolve(root, 'omni.config.ts'), configContent, 'omni.config.ts');

      console.log(chalk.blue.bold('\n  Project initialized!\n'));
      console.log(chalk.white('  Next steps:'));
      console.log(chalk.gray('  1. Edit .env and add your bot token and client ID'));
      console.log(chalk.gray('  2. Run ') + chalk.cyan('omni start') + chalk.gray(' to start the bot'));
      console.log(chalk.gray('  3. Run ') + chalk.cyan('omni addon create <name>') + chalk.gray(' to create an addon'));
      console.log();
    });
}
