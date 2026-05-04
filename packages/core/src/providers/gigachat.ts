/**
 * GigaChat-провайдер (Сбер). Серверы РФ, подходит для прода.
 *
 * Документация: https://developers.sber.ru/docs/ru/gigachat/api/overview
 *
 * Особенности:
 * - Авторизация: Basic AuthKey -> POST /api/v2/oauth -> access_token (TTL 30 мин).
 * - Endpoint: https://gigachat.devices.sberbank.ru/api/v1/chat/completions (OpenAI-подобный).
 * - Поддерживает response_format: { type: "json_object" } у моделей GigaChat-Pro / GigaChat-Max.
 *
 * Заглушка с реализацией. Перед использованием в проде — добавить:
 * - корректную работу с самоподписанным сертификатом Минцифры (Russian Trusted CA);
 * - retry с экспоненциальным backoff;
 * - кэширование access_token.
 */

import { z } from "zod";
import type { LLMCompleteOptions, LLMProvider, LLMResponse } from "./llm.js";

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class GigaChatProvider implements LLMProvider {
  readonly name = "gigachat";
  private authKey: string;
  private scope: string;
  private model: string;
  private tokenCache: TokenCache | null = null;
  private oauthUrl = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
  private apiUrl = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";

  constructor(authKey: string, scope = "GIGACHAT_API_PERS", model = "GigaChat-Pro") {
    this.authKey = authKey;
    this.scope = scope;
    this.model = model;
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }
    const rqUid = crypto.randomUUID();
    const res = await fetch(this.oauthUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.authKey}`,
        RqUID: rqUid,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: `scope=${this.scope}`,
    });
    if (!res.ok) throw new Error(`GigaChat OAuth failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_at: number };
    this.tokenCache = { token: json.access_token, expiresAt: json.expires_at };
    return json.access_token;
  }

  async complete<T>(opts: LLMCompleteOptions<T>): Promise<LLMResponse<T>> {
    const maxRetries = opts.maxRetries ?? 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await this.getToken();
        const res = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            temperature: opts.temperature ?? 0,
            messages: [
              { role: "system", content: opts.system },
              ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });
        if (!res.ok) throw new Error(`GigaChat API failed: ${res.status} ${await res.text()}`);
        const json = (await res.json()) as {
          choices: Array<{ message: { content: string } }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        const raw = json.choices[0]?.message?.content ?? "";
        if (!raw) throw new Error("Empty response");

        const parsed = JSON.parse(this.extractJson(raw));
        const validated = opts.schema.parse(parsed);

        return {
          data: validated,
          raw,
          model: this.model,
          inputTokens: json.usage?.prompt_tokens,
          outputTokens: json.usage?.completion_tokens,
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
    throw lastError ?? new Error("GigaChat call failed");
  }

  /** GigaChat иногда оборачивает JSON в ```json ... ``` — вытаскиваем. */
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
