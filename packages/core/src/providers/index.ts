/**
 * Фабрика LLM-провайдера. Принимает явный конфиг — НЕ читает process.env напрямую.
 * Это позволяет использовать пакет в любом окружении (Next.js, worker, скрипты).
 */

import type { LLMProvider } from "./llm.js";
import { OpenAIProvider } from "./openai.js";
import { GigaChatProvider } from "./gigachat.js";

export type ProviderConfig =
  | { kind: "openai"; apiKey: string; model?: string }
  | { kind: "gigachat"; authKey: string; scope?: string; model?: string };

export function createLLMProvider(config: ProviderConfig): LLMProvider {
  if (config.kind === "gigachat") {
    return new GigaChatProvider(config.authKey, config.scope, config.model);
  }
  if (config.kind === "openai") {
    return new OpenAIProvider(config.apiKey, config.model);
  }
  const _exhaust: never = config;
  throw new Error(`Unknown provider`);
}

export type { LLMProvider } from "./llm.js";
