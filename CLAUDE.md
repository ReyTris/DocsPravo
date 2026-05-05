# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

**PravoLetter** — AI-сервис разбора писем от государства и банков для физлиц и ИП в РФ. Монорепо на pnpm + Turbo.

## Команды (всегда из корня)

```bash
pnpm dev            # web + worker параллельно (turbo --parallel)
pnpm dev:web        # только Next.js (http://localhost:3000)
pnpm dev:worker     # только PgBoss-воркер
pnpm build          # turbo run build
pnpm typecheck      # типы по всему монорепо
pnpm lint           # turbo run lint
pnpm db:generate    # prisma generate
pnpm db:migrate     # применить миграции
pnpm db:studio      # GUI БД (5555)
pnpm evaluate       # прогон датасета через промт-цепочку (packages/core)
```

Запустить один пакет: `pnpm --filter @pravoletter/<name> <script>` (имена: `web`, `worker`, `core`, `db`, `schemas`).

Node ≥ 20, pnpm 9.7.0 (обязательный `packageManager`).

## Архитектура

Подробности — в [ARCHITECTURE.md](ARCHITECTURE.md). Ключевое, что нужно держать в голове:

### Два процесса, одна БД
- **`apps/web`** (Next.js 14 App Router) — это **и фронт, и HTTP backend** в одном процессе:
  - `src/app/` — UI-страницы и Route Handlers (`api/trpc/[trpc]`, `api/webhooks/*`).
  - `src/server/` — tRPC-роутеры, бизнес-логика, доступ к БД. **Не путать с `src/app/`**.
  - `src/lib/` — `env`, `jwt`, `storage` (Yandex Object Storage / S3).
- **`apps/worker`** — отдельный Node-процесс. Длинные операции (OCR + 3 вызова LLM, ~30–60 сек) **нельзя делать в HTTP-запросе**. Веб ставит задачу в очередь, воркер исполняет.
- Очередь — **pg-boss поверх того же Postgres** (никакого Redis).

### Поток обработки документа
1. `tRPC requestUploadUrl` → создаёт `Document(uploaded)`, отдаёт pre-signed URL.
2. Браузер кладёт файл напрямую в Object Storage.
3. `tRPC confirmUpload` → `pg-boss enqueue pipeline:run(documentId)`.
4. Worker: OCR (Yandex Vision) → `runPipeline()` из `packages/core` (маскирование ПД → классификация LLM → safety-гейт → извлечение полей → валидация → финальный разбор → unmask) → запись `Analysis`.
5. `documents.getById`: classify бесплатно, extract+analysis — только после оплаты (ЮKassa webhook → `Payment.status = succeeded`).

### Пакеты
- **`packages/schemas`** — Zod-схемы (`api` + `pipeline`). Шарят все приложения, включая будущий mobile.
- **`packages/core`** — промт-цепочка, маскер ПД, валидаторы, LLM-провайдеры (GigaChat / YandexGPT / OpenAI). Тестовый датасет в `dataset/`, прогон — `pnpm evaluate`.
- **`packages/db`** — Prisma schema + клиент. Источник истины: `packages/db/prisma/schema.prisma`.

### Авторизация
JWT (jose) + argon2. Access 15 мин, refresh 30 дней (sha256-хеш в БД, на вебе — httpOnly cookie). Один `protectedProcedure` обслуживает и web, и (будущий) mobile через тот же `/api/trpc/*`.

## Конвенции

### Один `.env` в корне
Единственный источник истины для dev. **Не создавать `.env` внутри `apps/*` или `packages/*`.** Скрипты `dev` обёрнуты в `dotenv-cli`:
```
"dev": "dotenv -e ../../.env -- next dev -p 3000"
```
В проде env подаётся платформой; dotenv-cli отрабатывает no-op. Список переменных — `globalEnv` в `turbo.json` и `.env.example`.

### Что и куда менять
| Хочу… | Иду в… |
|---|---|
| UI-страницу | `apps/web/src/app/` |
| HTTP API (бизнес-логику) | `apps/web/src/server/routers/` |
| Webhook (ЮKassa и т.п.) | `apps/web/src/app/api/webhooks/` |
| Схему БД | `packages/db/prisma/schema.prisma` (затем `pnpm db:migrate`) |
| Промт / LLM-логику | `packages/core/src/` |
| Общий тип/схему | `packages/schemas/src/` |
| Async-обработку | `apps/worker/src/jobs/` |

### Mobile-readiness
UI между web и mobile **не шарится** (всегда плохо кончается). Шарятся только типы/схемы/бизнес-логика (`packages/schemas`, `packages/core`) и API через tRPC. При изменениях в `src/server/routers/` помнить, что это публичный контракт.

### Платформа разработки
Windows (PowerShell). При нативных модулях (argon2) могут потребоваться Visual Studio Build Tools — fallback на `bcryptjs` упомянут в GETTING_STARTED.

## Документация в репозитории
- [GETTING_STARTED.md](GETTING_STARTED.md) — первый запуск с нуля.
- [ARCHITECTURE.md](ARCHITECTURE.md) — детальная архитектура и потоки данных.
- [CONCEPT.md](CONCEPT.md) — продуктовый концепт, защита от ответственности (152-ФЗ).
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — план реализации по фазам.
