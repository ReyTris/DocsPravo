# apps/worker

Async-обработка документов. Отдельный Node-процесс — потому что OCR + 3 LLM-вызова идут 30-60 сек, в HTTP-запросе их выполнять нельзя.

Очередь — `pg-boss` поверх Postgres (никакого Redis).

## Что делает

```
src/
├── index.ts              старт PgBoss, регистрация воркеров и cron
├── env.ts                Zod-валидация переменных окружения
├── llm.ts                ленивая инициализация LLM-провайдера
├── ocr.ts                Yandex Vision API
├── storage.ts            скачивание файлов из Object Storage
└── jobs/
    ├── pipeline.ts       главный: OCR → runPipeline() → запись Analysis + Deadline
    ├── reminders.ts      cron: рассылка напоминаний о сроках
    └── cleanup.ts        cron: автоудаление документов старше 30 дней (152-ФЗ)
```

## Очереди

| Имя | Триггер | Что делает |
|---|---|---|
| `pipeline:run` | `apps/web` после confirmUpload | OCR + промт-цепочка |
| `reminders:tick` | cron */30 мин | проверяет дедлайны на 24ч вперёд |
| `cleanup:tick` | cron 03:00 daily | удаляет файлы старше 30 дней |

## Запуск

```bash
# из корня
pnpm dev:worker

# или
pnpm --filter @prodoki/worker dev
```

Скрипт `dev` обёрнут в `dotenv-cli`, читает корневой `.env`.

## Зависимости от других пакетов

- `@prodoki/core` — `runPipeline`, `createLLMProvider`.
- `@prodoki/db` — Prisma-клиент.
- `@prodoki/schemas` — типы.

При изменениях в этих пакетах ничего пересобирать не нужно — TypeScript-исходники переиспользуются напрямую (`tsx watch`).
