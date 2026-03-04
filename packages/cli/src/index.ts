#!/usr/bin/env node

import { Command } from 'commander';
import { registerInitCommand } from './commands/init';
import { registerStartCommand } from './commands/start';
import { registerAddonCreateCommand } from './commands/addon-create';
import { registerAddonListCommand } from './commands/addon-list';

const program = new Command();

program
  .name('omni')
  .description('Omni Discord Bot CLI')
  .version('0.1.0');

registerInitCommand(program);
registerStartCommand(program);

const addon = program
  .command('addon')
  .description('Manage Omni addons');

registerAddonCreateCommand(addon);
registerAddonListCommand(addon);

program.parse(process.argv);
