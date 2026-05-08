# Getting Started

С нуля до открытия в браузере.

## 1. Требования

- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)
- Docker (для локального Postgres) — опционально, но удобно

## 2. Установка

```bash
git clone <repo> prodoki
cd prodoki
pnpm install
```

## 3. Конфигурация

Скопировать пример и заполнить **только то, что нужно сейчас**:

```bash
cp .env.example .env
```

Минимум для запуска лендинга и UI без real-сервисов:

```env
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prodoki
AUTH_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)

# Object Storage, ЮKassa, GigaChat — оставить пустыми, пока не нужны.
# Эндпойнты, которые их используют, упадут с понятной ошибкой.
```

> **Никаких других `.env` файлов нигде создавать не нужно.** Корневой `.env` подгружается автоматически в web и worker через `dotenv-cli` (см. [ARCHITECTURE.md](ARCHITECTURE.md)).

## 4. Postgres

Самый простой путь — Docker:

```bash
docker run -d --name prodoki-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=prodoki \
  -p 5432:5432 postgres:16
```

Или поднимите свой и впишите `DATABASE_URL`.

## 5. Prisma

```bash
pnpm db:generate    # сгенерировать клиент
pnpm db:migrate     # применить миграции (создаст таблицы)
```

## 6. Запуск

```bash
pnpm dev
```

Это поднимет одновременно:
- web на http://localhost:3000
- worker (PgBoss слушает очередь)

Альтернативы:

```bash
pnpm dev:web        # только фронт+API
pnpm dev:worker     # только воркер
```

Откройте **http://localhost:3000** — увидите лендинг.

## 7. Работа с Prisma

```bash
pnpm db:studio      # GUI для базы — http://localhost:5555
pnpm db:migrate     # после правки schema.prisma
```

## 8. Запуск валидации промт-цепочки на датасете

```bash
pnpm evaluate
```

Прогонит все документы из [packages/core/dataset/samples/](packages/core/dataset/samples/) через цепочку и покажет метрики. Требует `OPENAI_API_KEY` или `GIGACHAT_AUTH_KEY` в `.env`.

## 9. Полезные команды

```bash
pnpm typecheck      # проверка типов всего монорепо
pnpm build          # production-сборка
pnpm db:studio      # GUI БД
```

## Частые проблемы

- **«DATABASE_URL invalid»** — Postgres не запущен или url неверный.
- **«argon2 module failed to load»** — нужны build-tools (Visual Studio Build Tools на Windows). Альтернатива: `bcryptjs` чистый JS — поменять в `apps/web/src/server/routers/auth.ts`.
- **Изменили `.env`, dev не подхватил** — перезапустите `pnpm dev`. dotenv-cli читает env только при старте.
- **Изменили `schema.prisma`** — `pnpm db:migrate` создаст миграцию, и `pnpm db:generate` обновит клиент (миграция запускает generate автоматически).

## Куда дальше

- [ARCHITECTURE.md](ARCHITECTURE.md) — что где лежит и почему.
- [CONCEPT.md](CONCEPT.md) — концепт продукта.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — план по фазам.
