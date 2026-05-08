FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++ openssl
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

# ── deps: install all dependencies ──────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json    ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json    ./packages/core/
COPY packages/db/package.json      ./packages/db/
COPY packages/schemas/package.json ./packages/schemas/

RUN pnpm install --frozen-lockfile

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:/app/apps/worker/node_modules/.bin:$PATH"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --filter @prodoki/db prisma:generate

WORKDIR /app/apps/worker
CMD ["tsx", "src/index.ts"]
