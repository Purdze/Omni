FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source and build
COPY tsconfig.base.json tsconfig.addon.json ./
COPY packages/ packages/
RUN pnpm build

# Runtime
FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=base /app/packages/core/dist ./packages/core/dist
COPY --from=base /app/packages/core/package.json ./packages/core/
COPY --from=base /app/package.json ./
COPY --from=base /app/pnpm-workspace.yaml ./
COPY --from=base /app/tsconfig.addon.json ./

# These directories are mounted as volumes in production
RUN mkdir -p addons config/addons data

CMD ["node", "packages/core/dist/index.js"]
