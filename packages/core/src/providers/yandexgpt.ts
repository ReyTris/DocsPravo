/**
 * YandexGPT-провайдер. Серверы РФ, подходит для прода (152-ФЗ).
 *
 * Документация: https://yandex.cloud/ru/docs/foundation-models/api-ref/TextGeneration/completion
 *
 * Особенности:
 * - Endpoint: POST https://llm.api.cloud.yandex.net/foundationModels/v1/completion
 * - Auth: header `Authorization: Api-Key <key>` + body field `modelUri = gpt://<folderId>/<model>`
 * - Сообщения: { role, text } (НЕ content, как у OpenAI).
 * - Нативного JSON-mode нет — просим LLM отдать чистый JSON в system-промте,
 *   парсим аккуратно (могут быть markdown-fences вокруг).
 * - Логирование запросов: header `x-data-logging-enabled: false` отключает сохранение
 *   на стороне Яндекса (важно при работе с ПД, даже маскированными).
 */

import { z } from "zod";
import type { LLMCompleteOptions, LLMProvider, LLMResponse } from "./llm";

export interface YandexGPTOptions {
  apiKey: string;
  folderId: string;
  model?: string; // "yandexgpt/latest" | "yandexgpt-lite/latest" | ...
}

export class YandexGPTProvider implements LLMProvider {
  readonly name = "yandexgpt";
  private apiKey: string;
  private folderId: string;
  private model: string;
  private url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

  constructor(opts: YandexGPTOptions) {
    this.apiKey = opts.apiKey;
    this.folderId = opts.folderId;
    this.model = opts.model ?? "yandexgpt/latest";
  }

  async complete<T>(opts: LLMCompleteOptions<T>): Promise<LLMResponse<T>> {
    const maxRetries = opts.maxRetries ?? 2;
    let lastError: unknown;

    // Дописываем в system-промт явное требование JSON, т.к. native JSON-mode нет.
    const systemPrompt =
      opts.system +
      "\n\nКРИТИЧНО: ответ — ТОЛЬКО валидный JSON по схеме. Никакого текста до или после, никаких markdown-блоков ```json``` — только сырой JSON.";

    const messages = [
      { role: "system" as const, text: systemPrompt },
      ...opts.messages.map((m) => ({ role: m.role, text: m.content })),
    ];

    const modelUri = this.model.startsWith("gpt://")
      ? this.model
      : `gpt://${this.folderId}/${this.model}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(this.url, {
          method: "POST",
          headers: {
            Authorization: `Api-Key ${this.apiKey}`,
            "x-folder-id": this.folderId,
            "x-data-logging-enabled": "false",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            modelUri,
            completionOptions: {
              stream: false,
              temperature: opts.temperature ?? 0,
              maxTokens: 4000,
            },
            messages,
          }),
        });

        if (!res.ok) {
          throw new Error(`YandexGPT ${res.status}: ${await res.text()}`);
        }
        const json = (await res.json()) as {
          result: {
            alternatives: Array<{ message: { role: string; text: string } }>;
            usage?: { inputTextTokens: string; completionTokens: string; totalTokens: string };
          };
        };
        const raw = json.result.alternatives[0]?.message.text ?? "";
        if (!raw) throw new Error("Empty response from YandexGPT");

        const parsed = JSON.parse(this.extractJson(raw));
        const validated = opts.schema.parse(parsed);

        return {
          data: validated,
          raw,
          model: this.model,
          inputTokens: json.result.usage ? Number(json.result.usage.inputTextTokens) : undefined,
          outputTokens: json.result.usage ? Number(json.result.usage.completionTokens) : undefined,
        };
      } catch (err) {
        lastError = err;
        if (err instanceof z.ZodError && attempt < maxRetries) {
          opts.messages = [
            ...opts.messages,
            {
              role: "user",
              content: `Ответ не соответствует схеме ${opts.schemaName}: ${err.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")}. Верни корректный JSON.`,
            },
          ];
          continue;
        }
        if (attempt < maxRetries) continue;
        throw err;
      }
    }
    throw lastError ?? new Error("YandexGPT call failed");
  }

  private extractJson(raw: string): string {
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return trimmed;
  }
}
