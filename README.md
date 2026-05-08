# ПроДоки

AI-сервис разбора писем от государства и банков для физлиц и ИП в РФ.

## С чего начать

1. [GETTING_STARTED.md](GETTING_STARTED.md) — установка и запуск с нуля.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — что где лежит и почему.
3. [CONCEPT.md](CONCEPT.md) — концепт продукта, аудитория, защита от ответственности.
4. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — план реализации по фазам.

## Структура

```
.
├── apps/
│   ├── web/           Next.js 14: фронт + HTTP backend (tRPC)
│   └── worker/        Node + PgBoss: async обработка документов
├── packages/
│   ├── schemas/       Zod-схемы (api + pipeline). Шарят все.
│   ├── core/          Промт-цепочка, ПД-маскер, валидаторы, LLM-провайдеры.
│   └── db/            Prisma schema + клиент.
└── .env               Один файл на весь монорепо для dev.
```

## Команды (всё из корня)

```bash
pnpm install        # установка зависимостей всего монорепо
pnpm dev            # стартует web + worker одновременно
pnpm dev:web        # только web на http://localhost:3000
pnpm dev:worker     # только воркер
pnpm db:migrate     # миграции Prisma
pnpm db:studio      # GUI для БД
pnpm evaluate       # прогон датасета через промт-цепочку
pnpm typecheck      # проверка типов всего монорепо
pnpm build          # production-сборка
```
