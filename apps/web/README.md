# apps/web

Next.js 14 — **и frontend, и HTTP backend** в одном процессе.

## Что где

```
src/
├── app/                   ← FRONTEND (страницы пользователя, App Router)
│   ├── page.tsx           главный лендинг
│   ├── layout.tsx
│   ├── globals.css
│   └── api/               точки входа HTTP
│       ├── trpc/[trpc]/   шлюз к tRPC-роутерам из src/server
│       └── webhooks/      входящие хуки (ЮKassa и др.)
│
├── server/                ← BACKEND (бизнес-логика, доступ к БД)
│   ├── trpc.ts            bootstrap tRPC (router, publicProcedure, protectedProcedure)
│   ├── context.ts         контекст запроса (db, user из JWT, ip)
│   ├── routers/           tRPC-процедуры
│   │   ├── index.ts       AppRouter — корневой объединённый router
│   │   ├── auth.ts        register / login / refresh / logout
│   │   ├── documents.ts   requestUploadUrl / confirmUpload / list / getById
│   │   └── payments.ts    create (ЮKassa)
│   └── services/
│       └── jobs.ts        постановка задач в pg-boss-очередь (для воркера)
│
└── lib/                   утилиты (без бизнес-логики)
    ├── env.ts             валидация process.env через Zod
    ├── jwt.ts             access/refresh токены
    └── storage.ts         Yandex Object Storage (pre-signed URLs)
```

## Как это работает

- Запрос на страницу `/` → отдаёт `src/app/page.tsx` (Server Component, SSR).
- Запрос на `/api/trpc/documents.list` → `src/app/api/trpc/[trpc]/route.ts` → создаёт контекст из `src/server/context.ts` → дёргает процедуру из `src/server/routers/documents.ts` → возвращает JSON.
- Запрос на `/api/webhooks/ukassa` → `src/app/api/webhooks/ukassa/route.ts` → пишет в БД напрямую.

## Запуск

```bash
# из корня репо
pnpm dev:web

# или
pnpm --filter @prodoki/web dev
```

Скрипт `dev` обёрнут в `dotenv-cli`, читает корневой `.env`. Никакого собственного `.env` в `apps/web/` создавать не нужно.

## Дополнить

- Страницы `/login`, `/register`, `/upload`, `/documents/[id]` — будут.
- tRPC-клиент для React — в `src/lib/trpc-client.ts` (TODO).
