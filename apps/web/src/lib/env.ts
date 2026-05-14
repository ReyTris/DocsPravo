/**
 * Серверная конфигурация. Падает сразу, если что-то критичное отсутствует.
 * НИКОГДА не импортировать из клиентских компонентов.
 */

import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PUBLIC_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().url(),

  AUTH_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SEC: z.coerce.number().int().positive().default(2592000),

  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().default("ru-central1"),
  OBJECT_STORAGE_BUCKET: z.string(),
  OBJECT_STORAGE_ACCESS_KEY: z.string(),
  OBJECT_STORAGE_SECRET_KEY: z.string(),

  LLM_PROVIDER: z.enum(["openai", "gigachat", "yandex"]).default("gigachat"),
  GIGACHAT_AUTH_KEY: z.string().optional(),
  GIGACHAT_SCOPE: z.string().default("GIGACHAT_API_PERS"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  YANDEX_VISION_API_KEY: z.string().optional(),
  YANDEX_VISION_FOLDER_ID: z.string().optional(),

  UKASSA_SHOP_ID: z.string().optional(),
  UKASSA_SECRET_KEY: z.string().optional(),
  UKASSA_WEBHOOK_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("info@prodoki.ru"),
});

let cached: z.infer<typeof EnvSchema> | null = null;

export function env(): z.infer<typeof EnvSchema> {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid env:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  cached = parsed.data;
  return cached;
}
