# Архитектура ПроДоки

## TL;DR

Один `.env` в корне. Один `pnpm dev` в корне. Два процесса под капотом: web (Next.js) и worker (Node).

```
┌──────────────────────────────────────────────────────────────┐
│  pnpm dev  (из корня)                                         │
│                                                                │
│   ┌──────────────────────┐      ┌──────────────────────┐     │
│   │  apps/web            │      │  apps/worker         │     │
│   │                      │      │                      │     │
│   │  ▸ Frontend (UI)     │      │  ▸ OCR (Yandex Vision)│    │
│   │    src/app/...       │      │  ▸ Промт-цепочка     │     │
│   │                      │      │  ▸ Cron-задачи       │     │
│   │  ▸ Backend (HTTP)    │      │    (напоминания,     │     │
│   │    src/server/...    │      │     автоудаление)    │     │
│   │    tRPC + webhooks   │      │                      │     │
│   │                      │      │  Запускается через   │     │
│   │  Один Next.js        │      │  pg-boss (очередь    │     │
│   │  процесс (порт 3000) │      │  поверх Postgres)    │     │
│   └──────────┬───────────┘      └──────────┬───────────┘     │
│              │                              │                 │
│              └──────────────┬───────────────┘                 │
│                             │                                 │
│              ┌──────────────┴──────────────┐                 │
│              │                              │                 │
│   ┌──────────▼─────────┐    ┌──────────────▼──────────┐     │
│   │ PostgreSQL         │    │ Yandex Object Storage   │     │
│   │ (Yandex Managed)   │    │ (S3-совместимый)        │     │
│   └────────────────────┘    └─────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

## Где что

| Хочу найти... | Иди в... |
|---|---|
| Frontend-страницы пользователя | [apps/web/src/app/](apps/web/src/app/) |
| HTTP API (tRPC-роутеры) | [apps/web/src/server/routers/](apps/web/src/server/routers/) |
| Webhooks (ЮKassa и т.д.) | [apps/web/src/app/api/webhooks/](apps/web/src/app/api/webhooks/) |
| Авторизация (JWT) | [apps/web/src/lib/jwt.ts](apps/web/src/lib/jwt.ts) |
| Загрузка файлов в Object Storage | [apps/web/src/lib/storage.ts](apps/web/src/lib/storage.ts) |
| Async-обработка (OCR, LLM) | [apps/worker/src/](apps/worker/src/) |
| Промт-цепочка, маскер ПД, валидаторы | [packages/core/src/](packages/core/src/) |
| Схема БД (Prisma) | [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) |
| Zod-схемы (общие для web/worker/mobile) | [packages/schemas/src/](packages/schemas/src/) |
| Тестовый датасет для прогона цепочки | [packages/core/dataset/](packages/core/dataset/) |
| Список переменных окружения | [.env.example](.env.example) |
| Как запустить | [GETTING_STARTED.md](GETTING_STARTED.md) |

## Почему «бек» внутри `apps/web`

Next.js — full-stack фреймворк. Один и тот же процесс отдаёт и страницы, и HTTP API. Внутри `apps/web/`:
- **`src/app/`** — это **frontend**: страницы пользователя, React-компоненты.
- **`src/server/`** — это **backend**: tRPC-процедуры, бизнес-логика, доступ к БД.
- **`src/app/api/`** — точки входа HTTP (Next.js Route Handlers): `api/trpc/[trpc]` дёргает tRPC-роутеры из `src/server/`, `api/webhooks/*` обрабатывает входящие хуки.

Если в будущем появится мобильное приложение — оно будет ходить в **тот же** tRPC API (`/api/trpc/*`) поверх HTTPS с JWT, без переделки бэка.

## Почему отдельный worker

Длинные операции (OCR на скан + 3 вызова LLM ≈ 30–60 сек) **нельзя выполнять в HTTP-запросе** — таймауты, плохой UX. Пользователь видит «обрабатывается», а реальная работа идёт в `apps/worker/`. Очередь — `pg-boss` поверх того же Postgres (никакого Redis).

## Один `.env` в корне

Раньше env-файлы были размазаны. Сейчас:

- **Только корневой [`.env`](.env)** — единственный источник правды для локальной разработки.
- Скрипты `dev` в `apps/web` и `apps/worker` оборачивают команду через `dotenv-cli`:
  ```
  "dev": "dotenv -e ../../.env -- next dev -p 3000"
  ```
  Каждый процесс подгружает корневой `.env` через переменные окружения и стартует.
- В проде env-переменные передаются platform-of-choice (Yandex Cloud lockbox / docker-compose env_file / systemd EnvironmentFile) — `.env` файла нет, и dotenv-cli отрабатывает no-op.

## Запуск из корня

```bash
pnpm dev          # web + worker одновременно
pnpm dev:web      # только web
pnpm dev:worker   # только worker
```

Подробности и первый запуск с нуля — [GETTING_STARTED.md](GETTING_STARTED.md).

## Поток данных: загрузка документа

```
Browser                    apps/web                apps/worker             Yandex
   │                          │                        │                  Object
   │                          │                        │                  Storage
   │ 1. tRPC requestUploadUrl │                        │                    │
   ├─────────────────────────▶│                        │                    │
   │                          │ создаёт Document(uploaded) в БД             │
   │                          ├──────────────────────────────▶ Postgres    │
   │                          │ генерирует pre-signed URL                  │
   │ ◀────────── url + id ────┤                        │                    │
   │                          │                        │                    │
   │ 2. PUT файл напрямую     │                        │                    │
   ├──────────────────────────────────────────────────────────────────────▶│
   │                          │                        │                    │
   │ 3. tRPC confirmUpload    │                        │                    │
   ├─────────────────────────▶│                        │                    │
   │                          │ enqueue pipeline:run(documentId)            │
   │                          ├───────────────────────▶│                    │
   │                          │                        │ читает файл        │
   │                          │                        ├───────────────────▶│
   │                          │                        │ ◀ buffer ──────────│
   │                          │                        │ OCR (Yandex Vision)│
   │                          │                        │ runPipeline()      │
   │                          │                        │ — маскирование ПД  │
   │                          │                        │ — классификация LLM│
   │                          │                        │ — гейт безопасности│
   │                          │                        │ — извлечение полей │
   │                          │                        │ — валидация        │
   │                          │                        │ — финальный разбор │
   │                          │                        │ — обратный unmask  │
   │                          │                        │ запись Analysis    │
   │                          │                        ├──▶ Postgres        │
   │                          │                        │                    │
   │ 4. tRPC documents.getById│                        │                    │
   ├─────────────────────────▶│                        │                    │
   │ ◀ classify (бесплатно)  ◀┤                        │                    │
   │   extract+analysis: только если оплачено          │                    │
```

## Поток данных: оплата

```
1. tRPC payments.create
     → создаёт Payment(pending, idempotency_key)
     → POST к ЮKassa API → возвращает confirmation_url
     → клиент переходит, оплачивает
2. ЮKassa → POST /api/webhooks/ukassa
     → меняет Payment.status = succeeded
3. Чек уходит в "Мой налог" автоматически (настройка ЮKassa для самозанятого)
4. При следующем getById клиент получает полный разбор
```

## Авторизация

Bearer JWT в заголовке `Authorization`. Стандарт работает одинаково для web и будущего mobile.

- **Access token** (15 мин): подписан JWT_SECRET, содержит userId + role.
- **Refresh token** (30 дней): рандомная строка, sha256-хеш в БД.
  - На вебе → httpOnly cookie.
  - На мобайле → secure storage (Keychain / Keystore).
- При истечении access токена клиент дёргает `auth.refresh` → получает новый access + новый refresh, старый отзывается.

Один `protectedProcedure` в tRPC обслуживает оба клиента одинаково.

## Технологии

| Слой | Технология | Почему |
|---|---|---|
| Frontend | Next.js 14 App Router + React 18 + Tailwind | Стандарт, SSR для SEO |
| Backend HTTP API | tRPC 11 | Типы между web/mobile/server без OpenAPI |
| ORM | Prisma | DX, миграции, типизация |
| БД | PostgreSQL (Yandex Managed) | 152-ФЗ, надёжно |
| Очередь задач | pg-boss | Поверх Postgres, без Redis |
| Object Storage | Yandex Object Storage (S3 API) | 152-ФЗ |
| OCR | Yandex Vision | Лучший русский, 152-ФЗ |
| LLM | GigaChat / YandexGPT | 152-ФЗ |
| Платежи | ЮKassa | Самозанятый поддерживается |
| Auth | JWT (jose) + argon2 | Mobile-ready |

## Готовность к мобайлу

Когда настанет время:

1. Создать `apps/mobile/` — Expo + React Native.
2. Импортировать типы из `@prodoki/schemas` — те же.
3. Подключить `@trpc/client` с тем же AppRouter — типы из `apps/web/src/server/routers`.
4. Auth flow тот же (JWT в `Authorization: Bearer ...`).
5. Backend трогать **не требуется**.

UI-компоненты между web и mobile **не шарим** — это всегда заканчивается плохо. Шарим типы, схемы, бизнес-логику.

## Структура (на скриншот)

```
prodoki/
├── .env                       единственный для dev
├── .env.example
├── package.json               скрипты pnpm dev / pnpm dev:web / pnpm dev:worker
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
│
├── apps/
│   ├── web/                   ← Next.js: фронт + бэкенд HTTP
│   │   ├── src/
│   │   │   ├── app/           фронт-страницы и Route Handlers
│   │   │   ├── server/        бэкенд: tRPC роутеры
│   │   │   └── lib/           env, jwt, storage
│   │   ├── package.json       (dev обёрнут в dotenv-cli)
│   │   └── README.md
│   │
│   └── worker/                ← Node: async-обработка
│       ├── src/
│       │   ├── jobs/          pipeline / reminders / cleanup
│       │   ├── env.ts
│       │   ├── llm.ts
│       │   ├── ocr.ts
│       │   ├── storage.ts
│       │   └── index.ts
│       ├── package.json
│       └── README.md
│
├── packages/
│   ├── schemas/               Zod-схемы (api + pipeline). Шарят все.
│   ├── core/                  промт-цепочка, ПД-маскер, валидаторы, LLM-провайдеры
│   │   ├── src/
│   │   ├── dataset/           тестовые документы для evaluate
│   │   └── scripts/evaluate.ts
│   └── db/                    Prisma schema + клиент
│
├── ARCHITECTURE.md            этот файл
├── GETTING_STARTED.md         как запустить с нуля
├── CONCEPT.md                 концепт продукта
├── IMPLEMENTATION_PLAN.md     план по фазам
└── README.md
```
