FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++ openssl
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

# ── deps: install all dependencies ──────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json   ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json    ./packages/core/
COPY packages/db/package.json      ./packages/db/
COPY packages/schemas/package.json ./packages/schemas/

RUN pnpm install --frozen-lockfile

# ── builder: build Next.js ───────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Stub env for build phase — real values injected at runtime via env_file
ENV NODE_ENV=production \
    DATABASE_URL=postgresql://x:x@localhost/x \
    PUBLIC_BASE_URL=https://prodoki.online \
    AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
    JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
    OBJECT_STORAGE_ENDPOINT=https://storage.yandexcloud.net \
    OBJECT_STORAGE_BUCKET=prodoki-uploads \
    OBJECT_STORAGE_ACCESS_KEY=x \
    OBJECT_STORAGE_SECRET_KEY=x

RUN pnpm --filter @prodoki/db prisma:generate
RUN pnpm --filter @prodoki/web build

# ── runner: minimal runtime image ───────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules      ./node_modules
COPY --from=builder /app/packages          ./packages
COPY --from=builder /app/apps/web          ./apps/web
COPY --from=builder /app/package.json      ./
COPY --from=builder /app/pnpm-workspace.yaml ./

EXPOSE 3000

WORKDIR /app/apps/web
CMD ["node", "/app/node_modules/.bin/next", "start", "-p", "3000"]
