FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++ openssl
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

WORKDIR /app

# Install deps (cached layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json    ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json    ./packages/core/
COPY packages/db/package.json      ./packages/db/
COPY packages/schemas/package.json ./packages/schemas/

RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Stub values for build phase — not real secrets, real values injected at runtime
ARG DATABASE_URL=postgresql://x:x@localhost/x
ARG PUBLIC_BASE_URL=https://prodoki.online
ARG AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ARG JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ARG OBJECT_STORAGE_ENDPOINT=https://storage.yandexcloud.net
ARG OBJECT_STORAGE_BUCKET=prodoki-uploads
ARG OBJECT_STORAGE_ACCESS_KEY=x
ARG OBJECT_STORAGE_SECRET_KEY=x
ENV NODE_ENV=production \
    DATABASE_URL=$DATABASE_URL \
    PUBLIC_BASE_URL=$PUBLIC_BASE_URL \
    AUTH_SECRET=$AUTH_SECRET \
    JWT_SECRET=$JWT_SECRET \
    OBJECT_STORAGE_ENDPOINT=$OBJECT_STORAGE_ENDPOINT \
    OBJECT_STORAGE_BUCKET=$OBJECT_STORAGE_BUCKET \
    OBJECT_STORAGE_ACCESS_KEY=$OBJECT_STORAGE_ACCESS_KEY \
    OBJECT_STORAGE_SECRET_KEY=$OBJECT_STORAGE_SECRET_KEY

RUN pnpm --filter @prodoki/db prisma:generate
RUN pnpm --filter @prodoki/web build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production

# Copy entire built workspace from builder
COPY --from=builder /app ./

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
