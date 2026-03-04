# Omni

A modular, addon-based Discord bot built with TypeScript. Every feature is a plugin — from moderation to economy to custom integrations. Think Bukkit/Spigot, but for Discord.

## Why Omni?

Most Discord bots are monolithic — tightly coupled features, hard to extend, impossible to customize without forking. Omni is different:

- **Everything is an addon.** Core features ship as addons. Your custom features are addons. They all use the same API.
- **Self-hosted.** You own your data. Run it on your own server with SQLite — no external databases required.
- **Developer-first.** A clean addon API with typed config, namespaced databases, permission nodes, inter-addon communication, and hot reload.
- **Open source.** AGPL-3.0 licensed. Build whatever you want.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
git clone https://github.com/your-username/omni.git
cd omni
pnpm install
pnpm build
```

Copy `.env.example` to `.env` and fill in your bot token:

```
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
DISCORD_DEV_GUILD_ID=your-dev-guild-id  # optional, for instant command updates
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

## CLI

```bash
omni init                    # scaffold project directories
omni start                   # start the bot
omni start --dev             # start in development mode
omni addon create <name>     # scaffold a new addon
omni addon list              # list installed addons
```

## Creating an Addon

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

## Addon API

Every addon receives a `context` object with:

| Property | What it does |
|---|---|
| `logger` | Namespaced logging (`[Omni] [YourAddon] message`) |
| `commands` | Register slash commands |
| `events` | Listen to Discord events + custom Omni events |
| `config` | Persistent JSON config with type-safe get/set |
| `db` | Namespaced SQLite database via Drizzle ORM |
| `permissions` | Define and check custom permission nodes |
| `addons` | Expose/consume APIs between addons |
| `embeds` | Branded embed builder (info, success, warning, error) |
| `client` | Discord.js Client instance |

### Lifecycle

```
onLoad()    → Register commands, events, config, schemas
onEnable()  → Start processes, set up intervals, use inter-addon APIs
onDisable() → Cleanup (events and commands are auto-cleared)
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

### Hot Reload

Addons can be reloaded without restarting the bot. The core handles: disable → recompile → reload → re-enable → redeploy commands.

## Project Structure

```
omni/
├── packages/
│   ├── core/           # Bot runtime (@omni/core)
│   └── cli/            # CLI tool (@omni/cli)
├── addons/             # All addons live here (auto-detected on startup)
│   └── _template/      # Reference addon showing every API feature
├── config/addons/      # Auto-generated addon config files
├── data/               # SQLite database (created at runtime)
├── .env                # Bot token and settings
└── docker-compose.yml
```

## Roadmap

- [x] **Phase 1** — Core framework + addon API
- [ ] **Phase 2** — Built-in addons (moderation, tickets, leveling, economy, giveaways, auto-mod, suggestions, welcome/leave, reaction roles, temp channels)
- [ ] **Phase 3** — Premium modules (web dashboard, Minecraft integration, music, analytics)
- [ ] **Phase 4** — Addon marketplace + documentation site

## License

AGPL-3.0
