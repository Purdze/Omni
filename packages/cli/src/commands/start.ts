import { Command } from 'commander';
import chalk from 'chalk';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Start the Omni bot')
    .option('--dev', 'Run in development mode using tsx')
    .action((options: { dev?: boolean }) => {
      const root = process.cwd();

      let command: string;
      let args: string[];

      if (options.dev) {
        command = 'tsx';
        args = [path.resolve(root, 'packages', 'core', 'src', 'index.ts')];
        console.log(chalk.blue.bold('\n  Omni - Starting in development mode...\n'));
      } else {
        command = 'node';
        args = [path.resolve(root, 'packages', 'core', 'dist', 'index.js')];
        console.log(chalk.blue.bold('\n  Omni - Starting bot...\n'));
      }

      const child: ChildProcess = spawn(command, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

      child.on('error', (err: Error) => {
        if (options.dev && err.message.includes('ENOENT')) {
          console.error(chalk.red('\n  Error: tsx is not installed. Install it with: npm install -g tsx\n'));
        } else {
          console.error(chalk.red(`\n  Error starting bot: ${err.message}\n`));
        }
        process.exit(1);
      });

      child.on('exit', (code: number | null) => {
        if (code !== null && code !== 0) {
          console.error(chalk.red(`\n  Bot exited with code ${code}\n`));
          process.exit(code);
        }
      });

      const shutdown = (): void => {
        console.log(chalk.yellow('\n  Shutting down Omni...'));
        if (child.pid) {
          child.kill('SIGINT');
        }
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}
