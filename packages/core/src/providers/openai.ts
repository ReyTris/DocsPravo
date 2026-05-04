/**
 * OpenAI-провайдер. ВАЖНО: использовать только для разработки на синтетических документах.
 * Для прода с реальными ПД пользователей — GigaChat или YandexGPT.
 */

import OpenAI from "openai";
import { z } from "zod";
import type { LLMCompleteOptions, LLMProvider, LLMResponse } from "./llm.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async complete<T>(opts: LLMCompleteOptions<T>): Promise<LLMResponse<T>> {
    const maxRetries = opts.maxRetries ?? 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          temperature: opts.temperature ?? 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        const raw = response.choices[0]?.message?.content ?? "";
        if (!raw) throw new Error("Empty response from LLM");

        const parsed = JSON.parse(raw);
        const validated = opts.schema.parse(parsed);

        return {
          data: validated,
          raw,
          model: this.model,
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        };
      } catch (err) {
        lastError = err;
        if (err instanceof z.ZodError && attempt < maxRetries) {
          // Retry с уточнением схемы — следующая итерация добавит сообщение об ошибке
          opts.messages = [
            ...opts.messages,
            {
              role: "user",
              content: `Предыдущий ответ не прошёл валидацию схемы ${opts.schemaName}. Ошибки:\n${err.issues
                .map((i) => `- ${i.path.join(".")}: ${i.message}`)
                .join("\n")}\nВерни корректный JSON.`,
            },
          ];
          continue;
        }
        if (attempt < maxRetries) continue;
        throw err;
      }
    }
    throw lastError ?? new Error("LLM call failed");
  }
}
