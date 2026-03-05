# Omni

A modular, self-hosted Discord bot where every feature is a plugin. Think Bukkit/Spigot, but for Discord.

## Features

### Moderation
Full moderation suite with `/ban`, `/kick`, `/mute`, `/warn`, `/tempban`, `/slowmode`, `/lock`, punishment `/history`, and `/modlog`. Supports DM notifications, configurable warn thresholds, and automatic tempban expiry.

### Giveaways
Timed giveaways with button entry, automatic winner selection, and rerolls. Supports optional entry requirements like role gates and minimum account age. Use `/giveaway start`, `/giveaway end`, `/giveaway reroll`, `/giveaway list`, and `/giveaway delete`.

### Welcome/Leave
Customizable welcome and leave messages with auto-roles and member count channels. Configure via `/welcome channel`, `/welcome autorole`, `/welcome membercount`, and preview with `/welcome test`.

### Per-Guild Module Toggle
Server admins can enable or disable any addon per-guild:

- `/module list` - see all modules and their status
- `/module enable <name>` - enable a module
- `/module disable <name>` - disable a module

### Permission Management
Fine-grained permission control per-role using `/permissions`:

- `/permissions grant <role> <addon> <node>` - grant a permission to a role
- `/permissions deny <role> <addon> <node>` - deny a permission for a role
- `/permissions reset <role> <addon> <node>` - revert to default
- `/permissions list [role]` - show all overrides

Permission nodes autocomplete. Resolution order: database overrides then default Discord permissions. Guild owners bypass all checks.

### Temp Channels
Auto-creates temporary voice channels when users join a designated hub channel, and auto-deletes them when everyone leaves. Use `/tempchannel sethub`, `/tempchannel removehub`, and `/tempchannel list`. Configurable channel name template and user limit.

### Leveling
XP-based leveling system where users earn XP by chatting. Features include level-up notifications, role rewards at configurable levels, leaderboards, and manual XP management. Commands:

- `/rank [user]` - view level, XP, progress bar, and server rank
- `/leaderboard [page]` - top users ordered by XP
- `/xp set|add|remove <user> <amount>` - manage user XP (requires `leveling.manage`)
- `/rewards add|remove|list` - configure role rewards at level thresholds (requires `leveling.manage`)

Configurable XP range, cooldown, stack/replace role behavior, and level-up channel.

### Reaction Roles
Self-assign roles via buttons on staff-created panel messages. Staff create panels with a title and description, then add role buttons with custom labels, emojis, and colors. Members click buttons to toggle roles on/off with ephemeral feedback. Commands:

- `/reactionroles create <channel> <title> [description]` - post a new panel embed
- `/reactionroles addrole <message_id> <role> [label] [emoji] [style]` - add a role button to a panel
- `/reactionroles removerole <message_id> <role>` - remove a role button from a panel
- `/reactionroles delete <message_id>` - delete a panel and its message
- `/reactionroles list` - list all panels in the server

### Auto-Moderation
Automated moderation with word/regex filtering, spam detection, link filtering, and anti-raid protection. Features escalating punishments (warn, mute, kick, ban) based on violation count, with optional integration into the moderation addon for unified warning tracking. Commands:

- `/automod wordfilter add|remove|list` - manage word and regex content filters
- `/automod linkfilter toggle|allowlist|blocklist` - control link filtering with domain lists
- `/automod spam config` - tune spam detection thresholds (message rate, duplicates, mentions)
- `/automod raid config` - configure anti-raid (join threshold, lockdown or alert action)
- `/automod punishments set|remove|list` - configure escalating punishment steps
- `/automod exempt add|remove|list` - exempt roles or channels from filtering
- `/automod-status` - view all current auto-mod settings at a glance

### More Coming Soon
Tickets, economy, and suggestions are all in development.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
git clone https://github.com/Purdze/Omni.git
cd omni
pnpm install
```

This installs dependencies, builds the project, and links the `omni` CLI globally. If the global link fails, run `pnpm setup`, open a new terminal, then `cd packages/cli && pnpm link --global`.

Copy `.env.example` to `.env` and fill in your bot token:

```
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
DISCORD_DEV_GUILD_ID=your-dev-guild-id  # optional, for instant command updates

# Optional: use MySQL instead of SQLite
# OMNI_DB_DRIVER=mysql
# OMNI_DB_HOST=localhost
# OMNI_DB_PORT=3306
# OMNI_DB_USER=omni
# OMNI_DB_PASSWORD=
# OMNI_DB_NAME=omni
```

### Run

```bash
pnpm start
```

For development with auto-reload:

```bash
pnpm dev
```

### Docker

```bash
cp .env.example .env
# edit .env with your token
docker compose up -d
```

### CLI

```bash
omni init                    # scaffold project directories
omni start                   # start the bot
omni start --dev             # start in development mode
omni addon create <name>     # scaffold a new addon
omni addon list              # list installed addons
```

---

## Developer Guide

Everything below is for addon developers who want to extend Omni with custom features.

### Creating an Addon

```bash
omni addon create my-addon
```

This creates `addons/my-addon/` with a starter template. Edit `src/index.ts`:

```ts
import { Addon } from '@omni/core';
import { SlashCommandBuilder } from 'discord.js';

export default class MyAddon extends Addon {
  async onLoad() {
    this.context.commands.register({
      data: new SlashCommandBuilder()
        .setName('hello')
        .setDescription('Say hello'),
      execute: async (interaction) => {
        const embed = this.context.embeds.success('Hello!', 'Welcome to Omni.');
        await interaction.reply({ embeds: [embed] });
      },
    });
  }

  async onEnable() {
    this.context.events.on('messageCreate', async (message) => {
      if (message.content === '!ping') await message.reply('Pong!');
    });
  }

  async onDisable() {}
}
```

Restart the bot and your addon is live. See `addons/_template/` for a comprehensive reference covering every API feature.

### Addon API

Every addon receives a `context` object with:

| Property | What it does |
|---|---|
| `logger` | Namespaced logging (`[Omni] [YourAddon] message`) |
| `commands` | Register slash commands |
| `events` | Listen to Discord events + custom Omni events |
| `config` | Persistent YAML config with type-safe get/set |
| `db` | Namespaced database via Drizzle ORM (SQLite or MySQL) |
| `permissions` | Define and check custom permission nodes |
| `addons` | Expose/consume APIs between addons |
| `modules` | Check if your addon is enabled in a guild |
| `embeds` | Branded embed builder (info, success, warning, error) with optional fields, author, thumbnail, image |
| `client` | Discord.js Client instance |

### Lifecycle

```
onLoad()    - Register commands, events, config, schemas
onEnable()  - Start processes, set up intervals, use inter-addon APIs
onDisable() - Cleanup (events and commands are auto-cleared)
```

### Manifest

Every addon has an `addon.manifest.json`:

```json
{
  "id": "my-addon",
  "name": "My Addon",
  "version": "1.0.0",
  "description": "What it does",
  "author": "Your Name",
  "main": "src/index.ts",
  "dependencies": [],
  "permissions": [
    {
      "id": "my-addon.manage",
      "description": "Manage this addon",
      "defaultDiscordPermissions": ["ManageGuild"]
    }
  ]
}
```

### Inter-Addon Communication

Expose an API from your addon:

```ts
this.context.addons.expose({
  getBalance: (userId: string) => this.balances.get(userId) ?? 0,
});
```

Consume another addon's API:

```ts
const economy = this.context.addons.getAPI<EconomyAPI>('economy');
if (economy) {
  const balance = economy.getBalance(userId);
}
```

### Module Self-Gating

When a module is disabled via `/module disable`, its commands are automatically blocked. Addons should also self-gate their event handlers:

```ts
this.context.events.on('messageCreate', async (message) => {
  if (!message.guild) return;
  if (!(await this.context.modules.isEnabled(message.guild.id))) return;
  // ...
});
```

### Hot Reload

Addons can be reloaded without restarting the bot. The core handles: disable, recompile, reload, re-enable, and redeploy commands.

### Project Structure

```
omni/
├── packages/
│   ├── core/           # Bot runtime (@omni/core)
│   └── cli/            # CLI tool (@omni/cli)
├── addons/             # All addons live here (auto-detected on startup)
│   └── _template/      # Reference addon showing every API feature
├── config/addons/      # Auto-generated addon config files
├── data/               # SQLite database file (created at runtime)
├── .env                # Bot token and settings
└── docker-compose.yml
```

## Documentation

Full documentation is available at [omnibot.dev](https://omnibot.dev) or can be built locally:

```bash
cd docs && pnpm install && pnpm dev
```

## Roadmap

- [x] **Phase 1** - Core framework + addon API
- [ ] **Phase 2** - Built-in addons (~~moderation~~, tickets, ~~leveling~~, economy, ~~giveaways~~, ~~auto-mod~~, suggestions, ~~welcome/leave~~, ~~reaction roles~~, ~~temp channels~~)
- [ ] **Phase 3** - Premium modules (web dashboard, Minecraft integration, music, analytics)
- [ ] **Phase 4** - Addon marketplace + documentation site

## License

AGPL-3.0
