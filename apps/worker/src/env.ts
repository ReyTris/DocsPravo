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
});

export const env = Env.parse(process.env);
