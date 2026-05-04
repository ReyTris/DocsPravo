/**
 * Абстракция над LLM-провайдером.
 *
 * Принципы:
 * - Принимаем системный промт + сообщения + Zod-схему ответа.
 * - Провайдер должен вернуть валидный JSON, который мы валидируем Zod-ом на стороне приложения.
 * - В проде используем GigaChatProvider или YandexGPTProvider (ПД остаются в РФ).
 * - OpenAIProvider — только для разработки на синтетических документах.
 */

import { z } from "zod";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompleteOptions<T> {
  system: string;
  messages: LLMMessage[];
  // Третий generic-параметр z.ZodType (Input) — any, чтобы разрешить схемы с .transform()
  // (input может быть `string | null`, output — `string`, и это нормально).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  schemaName: string;
  temperature?: number;
  maxRetries?: number;
}

export interface LLMResponse<T> {
  data: T;
  raw: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  complete<T>(opts: LLMCompleteOptions<T>): Promise<LLMResponse<T>>;
}
