// env-переменные подгружаются скриптом через dotenv-cli из корневого .env
// (см. package.json: "dev": "dotenv -e ../../.env -- ...").
import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url(),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().default("ru-central1"),
  OBJECT_STORAGE_BUCKET: z.string(),
  OBJECT_STORAGE_ACCESS_KEY: z.string(),
  OBJECT_STORAGE_SECRET_KEY: z.string(),

  LLM_PROVIDER: z.enum(["openai", "gigachat", "yandex"]).default("yandex"),
  GIGACHAT_AUTH_KEY: z.string().optional(),
  GIGACHAT_SCOPE: z.string().default("GIGACHAT_API_PERS"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  YANDEX_API_KEY: z.string().optional(),
  YANDEX_FOLDER_ID: z.string().optional(),
  YANDEX_MODEL: z.string().default("yandexgpt/latest"),

  YANDEX_VISION_API_KEY: z.string().optional(),
  YANDEX_VISION_FOLDER_ID: z.string().optional(),
  OCR_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),

  // Vision-пайплайн через Qwen 3.6-35B (или другую VL-модель) в Yandex AI Studio.
  // Если включено — worker пропускает OCR + 3-шаговую LLM-цепочку и делает один
  // VL-запрос. Использует YANDEX_API_KEY и YANDEX_FOLDER_ID.
  USE_VISION_PIPELINE: z
    .union([z.literal("true"), z.literal("false"), z.literal("")])
    .default("false")
    .transform((v) => v === "true"),
  // Полный modelUri в формате `gpt://<folder>/qwen3.6-35b/latest`. Подсмотреть
  // точное имя — в карточке модели в Yandex AI Studio (кнопка "Использовать в API").
  VISION_MODEL_URI: z.string().optional(),
  // Таймаут VL-запроса. Многостраничные документы (10+ картинок) уходят за минуту;
  // дефолт vision-pipeline-а в core — 60с, для прода маловат.
  VISION_TIMEOUT_MS: z.coerce.number().int().positive().default(240_000),
});

export const env = Env.parse(process.env);
