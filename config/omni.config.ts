/// <reference types="node" />
export default {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  devGuildId: process.env.DISCORD_DEV_GUILD_ID,
  logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
};
