import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

export function registerAddonCreateCommand(parent: Command): void {
  parent
    .command('create <name>')
    .description('Scaffold a new addon')
    .action((name: string) => {
      const root = process.cwd();
      const addonDir = path.resolve(root, 'addons', name);

      console.log(chalk.blue.bold(`\n  Omni — Creating addon "${name}"...\n`));

      if (fs.existsSync(addonDir)) {
        console.error(chalk.red(`  Error: Addon directory already exists at addons/${name}/\n`));
        process.exit(1);
      }

      const srcDir = path.resolve(addonDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      console.log(chalk.green('  created ') + chalk.gray(`addons/${name}/src/`));

      const manifest = {
        id: name,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        version: '1.0.0',
        description: `The ${name} addon for Omni`,
        author: 'Your Name',
        main: 'src/index.ts',
        dependencies: [],
        permissions: [],
      };

      const manifestPath = path.resolve(addonDir, 'addon.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
      console.log(chalk.green('  created ') + chalk.gray(`addons/${name}/addon.manifest.json`));

      const indexContent = `import { Addon } from '@omni/core';

export default class ${toPascalCase(name)}Addon extends Addon {
  async onLoad(): Promise<void> {
    this.context.logger.info('${toPascalCase(name)} addon loaded!');

    // Register commands, events, config defaults, and database schemas here.
    // Example:
    // this.context.commands.register({ ... });
    // this.context.events.on('messageCreate', async (message) => { ... });
  }

  async onEnable(): Promise<void> {
    this.context.logger.info('${toPascalCase(name)} addon enabled!');

    // Start any active processes (intervals, listeners, etc.) here.
  }

  async onDisable(): Promise<void> {
    this.context.logger.info('${toPascalCase(name)} addon disabled.');

    // Optional cleanup — events and commands are auto-cleared by the core.
  }
}
`;

      const indexPath = path.resolve(srcDir, 'index.ts');
      fs.writeFileSync(indexPath, indexContent, 'utf-8');
      console.log(chalk.green('  created ') + chalk.gray(`addons/${name}/src/index.ts`));

      const tsconfig = {
        extends: '../../tsconfig.addon.json',
        compilerOptions: {
          outDir: '.omni-cache',
          rootDir: 'src',
        },
        include: ['src/**/*'],
      };

      const tsconfigPath = path.resolve(addonDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
      console.log(chalk.green('  created ') + chalk.gray(`addons/${name}/tsconfig.json`));

      console.log(chalk.blue.bold('\n  Addon created!\n'));
      console.log(chalk.white('  Next steps:'));
      console.log(chalk.gray('  1. Edit ') + chalk.cyan(`addons/${name}/addon.manifest.json`) + chalk.gray(' with your details'));
      console.log(chalk.gray('  2. Build your addon in ') + chalk.cyan(`addons/${name}/src/index.ts`));
      console.log(chalk.gray('  3. Restart the bot to load your addon'));
      console.log();
    });
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
