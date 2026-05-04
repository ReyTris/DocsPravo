import { createLLMProvider, type LLMProvider } from "@pravoletter/core";
import { env } from "./env";

let cached: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (cached) return cached;

  if (env.LLM_PROVIDER === "yandex") {
    if (!env.YANDEX_API_KEY || !env.YANDEX_FOLDER_ID) {
      throw new Error("YANDEX_API_KEY и YANDEX_FOLDER_ID должны быть заданы");
    }
    cached = createLLMProvider({
      kind: "yandex",
      apiKey: env.YANDEX_API_KEY,
      folderId: env.YANDEX_FOLDER_ID,
      model: env.YANDEX_MODEL,
    });
  } else if (env.LLM_PROVIDER === "gigachat") {
    if (!env.GIGACHAT_AUTH_KEY) throw new Error("GIGACHAT_AUTH_KEY не задан");
    cached = createLLMProvider({
      kind: "gigachat",
      authKey: env.GIGACHAT_AUTH_KEY,
      scope: env.GIGACHAT_SCOPE,
    });
  } else {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY не задан");
    cached = createLLMProvider({
      kind: "openai",
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
    });
  }
  return cached;
}
