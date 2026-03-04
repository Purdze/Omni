import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description: string;
}

export function registerAddonListCommand(parent: Command): void {
  parent
    .command('list')
    .description('List all installed addons')
    .action(() => {
      const root = process.cwd();
      const addonsDir = path.resolve(root, 'addons');

      console.log(chalk.blue.bold('\n  Omni - Installed addons\n'));

      if (!fs.existsSync(addonsDir)) {
        console.log(chalk.yellow('  No addons directory found. Run ') + chalk.cyan('omni init') + chalk.yellow(' first.\n'));
        return;
      }

      const entries = fs.readdirSync(addonsDir, { withFileTypes: true });
      const addonDirs = entries.filter((entry) => entry.isDirectory());

      if (addonDirs.length === 0) {
        console.log(chalk.gray('  No addons installed.\n'));
        console.log(chalk.white('  Create one with: ') + chalk.cyan('omni addon create <name>\n'));
        return;
      }

      const addons: AddonManifest[] = [];

      for (const dir of addonDirs) {
        const manifestPath = path.resolve(addonsDir, dir.name, 'addon.manifest.json');

        if (!fs.existsSync(manifestPath)) {
          console.log(chalk.yellow(`  Warning: ${dir.name}/ has no addon.manifest.json - skipping`));
          continue;
        }

        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          const manifest: AddonManifest = JSON.parse(raw);
          addons.push({
            id: manifest.id || dir.name,
            name: manifest.name || dir.name,
            version: manifest.version || '?.?.?',
            description: manifest.description || '',
          });
        } catch {
          console.log(chalk.red(`  Error: Failed to parse ${dir.name}/addon.manifest.json - skipping`));
        }
      }

      if (addons.length === 0) {
        console.log(chalk.gray('  No valid addons found.\n'));
        return;
      }

      const colId = Math.max('ID'.length, ...addons.map((a) => a.id.length));
      const colName = Math.max('NAME'.length, ...addons.map((a) => a.name.length));
      const colVersion = Math.max('VERSION'.length, ...addons.map((a) => a.version.length));
      const colDesc = 'DESCRIPTION'.length;

      const pad = (str: string, len: number): string => str + ' '.repeat(Math.max(0, len - str.length));

      const header =
        '  ' +
        chalk.bold(pad('ID', colId)) + '  ' +
        chalk.bold(pad('NAME', colName)) + '  ' +
        chalk.bold(pad('VERSION', colVersion)) + '  ' +
        chalk.bold('DESCRIPTION');
      console.log(header);

      const separator =
        '  ' +
        chalk.gray('-'.repeat(colId)) + '  ' +
        chalk.gray('-'.repeat(colName)) + '  ' +
        chalk.gray('-'.repeat(colVersion)) + '  ' +
        chalk.gray('-'.repeat(colDesc));
      console.log(separator);

      for (const addon of addons) {
        const row =
          '  ' +
          chalk.cyan(pad(addon.id, colId)) + '  ' +
          pad(addon.name, colName) + '  ' +
          chalk.green(pad(addon.version, colVersion)) + '  ' +
          chalk.gray(addon.description);
        console.log(row);
      }

      console.log(chalk.gray(`\n  ${addons.length} addon(s) found.\n`));
    });
}
