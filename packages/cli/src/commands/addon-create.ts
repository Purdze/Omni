import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface AddonOptions {
  id: string;
  displayName: string;
  description: string;
  author: string;
  includeExamples: boolean;
}

function prompt(rl: readline.Interface, question: string, fallback: string): Promise<string> {
  const label = fallback ? `${question} ${chalk.gray(`(${fallback})`)}: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(label, (answer) => resolve(answer.trim() || fallback));
  });
}

function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} ${chalk.gray('(Y/n)')}: `, (answer) => {
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

async function promptForOptions(rl: readline.Interface): Promise<AddonOptions> {
  console.log(chalk.blue.bold('\n  Omni — Create a new addon\n'));

  const id = await prompt(rl, '  Addon ID (kebab-case)', '');
  if (!id) {
    console.error(chalk.red('\n  Error: Addon ID is required.\n'));
    process.exit(1);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    console.error(chalk.red('\n  Error: Addon ID must be kebab-case (e.g. "my-addon").\n'));
    process.exit(1);
  }

  const displayName = await prompt(rl, '  Display name', toPascalCase(id));
  const description = await prompt(rl, '  Description', `The ${id} addon for Omni`);
  const author = await prompt(rl, '  Author', 'Your Name');
  const includeExamples = await confirm(rl, '  Include example command and event?');

  return { id, displayName, description, author, includeExamples };
}

export function registerAddonCreateCommand(parent: Command): void {
  parent
    .command('create')
    .description('Scaffold a new addon')
    .action(async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      let opts: AddonOptions;
      try {
        opts = await promptForOptions(rl);
      } finally {
        rl.close();
      }
      console.log();
      scaffoldAddon(opts);
    });
}

function scaffoldAddon(opts: AddonOptions): void {
  const root = process.cwd();
  const addonDir = path.resolve(root, 'addons', opts.id);

  if (fs.existsSync(addonDir)) {
    console.error(chalk.red(`  Error: Addon directory already exists at addons/${opts.id}/\n`));
    process.exit(1);
  }

  const srcDir = path.resolve(addonDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  console.log(chalk.green('  created ') + chalk.gray(`addons/${opts.id}/src/`));

  const manifest = {
    id: opts.id,
    name: opts.displayName,
    version: '1.0.0',
    description: opts.description,
    author: opts.author,
    main: 'src/index.ts',
    dependencies: [],
    permissions: [],
  };

  writeFile(
    path.resolve(addonDir, 'addon.manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    `addons/${opts.id}/addon.manifest.json`,
  );

  const className = toPascalCase(opts.id);
  const indexContent = opts.includeExamples
    ? generateExampleIndex(className, opts.id)
    : generateMinimalIndex(className);

  writeFile(
    path.resolve(srcDir, 'index.ts'),
    indexContent,
    `addons/${opts.id}/src/index.ts`,
  );

  writeFile(
    path.resolve(addonDir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: '../../tsconfig.addon.json',
        compilerOptions: { outDir: '.omni-cache', rootDir: 'src' },
        include: ['src/**/*'],
      },
      null,
      2,
    ) + '\n',
    `addons/${opts.id}/tsconfig.json`,
  );

  console.log(chalk.blue.bold('\n  Addon created!\n'));
  console.log(chalk.white('  Next steps:'));
  console.log(chalk.gray('  1. Edit ') + chalk.cyan(`addons/${opts.id}/addon.manifest.json`) + chalk.gray(' with your details'));
  console.log(chalk.gray('  2. Build your addon in ') + chalk.cyan(`addons/${opts.id}/src/index.ts`));
  console.log(chalk.gray('  3. Restart the bot to load your addon'));
  console.log();
}

function writeFile(filePath: string, content: string, label: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(chalk.green('  created ') + chalk.gray(label));
}

function generateMinimalIndex(className: string): string {
  return `import { Addon } from '@omni/core';

export default class ${className}Addon extends Addon {
  async onLoad(): Promise<void> {
    this.context.logger.info('${className} addon loaded!');
  }

  async onEnable(): Promise<void> {
    this.context.logger.info('${className} addon enabled!');
  }

  async onDisable(): Promise<void> {
    this.context.logger.info('${className} addon disabled.');
  }
}
`;
}

function generateExampleIndex(className: string, id: string): string {
  return `import { Addon } from '@omni/core';
import { SlashCommandBuilder } from 'discord.js';

export default class ${className}Addon extends Addon {
  async onLoad(): Promise<void> {
    this.context.commands.register({
      data: new SlashCommandBuilder()
        .setName('${id}')
        .setDescription('An example command from ${className}'),
      execute: async (interaction) => {
        const embed = this.context.embeds.success('${className}', 'Hello from ${className}!');
        await interaction.reply({ embeds: [embed] });
      },
    });

    this.context.logger.info('${className} addon loaded!');
  }

  async onEnable(): Promise<void> {
    this.context.events.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (!(await this.context.modules.isEnabled(message.guild.id))) return;

      if (message.content === '!${id}') {
        await message.reply('${className} is running!');
      }
    });

    this.context.logger.info('${className} addon enabled!');
  }

  async onDisable(): Promise<void> {
    this.context.logger.info('${className} addon disabled.');
  }
}
`;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
