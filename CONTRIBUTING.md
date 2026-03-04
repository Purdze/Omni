# Contributing to Omni

Thanks for your interest in contributing! Omni is an addon-based Discord bot where every feature is a plugin. This guide covers contributing to both the core framework and addons.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))

### Setup

```bash
git clone https://github.com/Purdze/Omni.git
cd omni
pnpm install
cp .env.example .env
# Fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, and optionally DISCORD_DEV_GUILD_ID
pnpm build
```

### Development

```bash
pnpm dev     # run with tsx (auto-reloads on save)
pnpm build   # compile everything
pnpm start   # run compiled output
```

Set `DISCORD_DEV_GUILD_ID` in `.env` for instant slash command updates during development (guild-scoped commands deploy immediately, global commands can take up to an hour).

## Project Structure

```
omni/
├── packages/
│   ├── core/           # Bot runtime, addon API, database, commands (@omni/core)
│   └── cli/            # CLI scaffolding tool (@omni/cli)
├── addons/             # Addons (auto-detected on startup)
│   └── _template/      # Reference addon — covers every API feature
├── config/addons/      # Auto-generated addon configs
└── data/               # SQLite database (created at runtime)
```

This is a pnpm workspace monorepo. The two packages are `@omni/core` (the bot runtime) and `@omni/cli` (the scaffolding tool).

## Contributing an Addon

The fastest way to contribute is by building an addon:

```bash
pnpm start             # or: omni addon create my-addon
```

Or manually create `addons/my-addon/` with:

- `addon.manifest.json` — metadata, dependencies, permissions
- `src/index.ts` — a class extending `Addon` from `@omni/core`
- `tsconfig.json` — extend `../../tsconfig.addon.json`

See `addons/_template/` for a comprehensive reference covering commands, events, config, database, permissions, inter-addon APIs, and embeds.

### Addon Guidelines

- **One concern per addon.** Don't bundle unrelated features.
- **Namespace your tables.** Prefix database tables with your addon ID: `my-addon_tablename`.
- **Use the permission system.** Define permission nodes in your manifest for any privileged commands.
- **Respect module toggles.** If your addon listens to events, gate them with `this.context.modules.isEnabled(guildId)` so server admins can disable your addon per-guild.
- **Keep dependencies minimal.** The core provides Discord.js, Drizzle ORM, and better-sqlite3. Only add what you truly need.
- **Handle errors.** Never let unhandled errors leak out of your addon — the core isolates failures, but clean error handling is still expected.

## Contributing to Core

Core changes affect every addon and every bot instance. Be careful and deliberate.

### Architecture

- **AddonManager** — lifecycle: discover, compile, load, enable, disable, reload
- **CommandManager** — slash command registration and ownership tracking
- **CommandGuard** — pre-execution checks (module toggle, guild-only, cooldown, permissions)
- **ModuleManager** — per-guild addon enable/disable backed by the `disabled_modules` table
- **EventBus** — routes Discord events to addon subscribers
- **PermissionManager** — custom permission nodes with database overrides
- **DatabaseManager** — SQLite (default) or MySQL, with Drizzle ORM
- **AddonContext** — the injected context object every addon receives

### Adding a Core Table

1. Add the Drizzle schema to both `schema.sqlite.ts` and `schema.mysql.ts`
2. Add it to `getCoreSchema()` in `schema.ts`
3. Add the raw DDL to both `createCoreTablesSQLite()` and `createCoreTablesMySQL()` in `DatabaseManager.ts`

### Code Style

- TypeScript strict mode, CommonJS output (not ESM)
- Use `chalk` v4 (CommonJS-compatible)
- Cast Drizzle DB to `any` when the union type (`BetterSQLite3Database | MySql2Database`) prevents calling `.select()`, `.insert()`, etc. — this matches the existing pattern in `PermissionManager`
- No unnecessary comments — code should be self-explanatory. Comments are for the *why*, not the *what*
- No over-engineering — don't add abstractions for one-time operations

### Checklist

Before submitting a PR:

1. `pnpm build` compiles with zero errors
2. New features are tested manually against a real Discord bot
3. If you added a new context property, update `AddonContext` in `types/addon.ts`, wire it in `AddonContext.ts`, and pass it through `AddonManager.ts`
4. If you added a new export, add it to `packages/core/src/index.ts`

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Write a clear description of what changed and why
- Reference any related issues

## Reporting Issues

Open an issue on GitHub with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Node.js version, OS, and database driver (SQLite/MySQL)

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0.
