/**
 * Оркестратор гибридной промт-цепочки v4.
 *
 * Теперь pipeline разбирает ВСЕ документы, включая red. Tier — это метка
 * для UI (показать дополнительные предупреждения), а не блокировщик.
 *
 * Для каждого не-error случая:
 *  - navigator (универсальный пересказ) — всегда.
 *  - yellow_summary — всегда (если LLM не упал).
 *  - extract + analyze — пробуем всегда: если документ зелёный — точно сработает,
 *    для других может быть менее точно, но результат отдаём.
 */

import { classify } from "./steps/classify";
import { extract } from "./steps/extract";
import { analyze } from "./steps/analyze";
import { navigate } from "./steps/navigator";
import { route } from "./router";
import { maskPii, unmaskDeep } from "./pii";
import {
  hasErrors,
  validateAnalysis,
  validateExtract,
  type ValidationIssue,
} from "./validators";
import { type PipelineResult } from "@prodoki/schemas";
import type { LLMProvider } from "./providers/llm";

export const PIPELINE_VERSION = "pipeline-v6-flat";

export interface RunOptions {
  /** Минимальная уверенность classify, чтобы пытаться extract+analyze. По умолчанию 0 — пробуем всегда. */
  minClassifyConfidence?: number;
}

export async function runPipeline(
  provider: LLMProvider,
  ocrText: string,
  options: RunOptions = {},
): Promise<PipelineResult & { validation_issues?: ValidationIssue[] }> {
  const t0 = Date.now();
  const minConfidence = options.minClassifyConfidence ?? 0;
  const baseMeta = {
    prompt_version: PIPELINE_VERSION,
    model: provider.name,
    duration_ms: 0,
  };
  const finalize = <T extends object>(r: T) => ({
    ...r,
    meta: { ...baseMeta, duration_ms: Date.now() - t0 },
  });

  try {
    // ШАГ 1: маскирование ПД
    const { masked, map } = maskPii(ocrText);

    // ШАГ 2: универсальный навигатор
    const navMasked = await navigate(provider, masked);

    // ШАГ 3: маршрутизация (tier — только метка для UI)
    const decision = route(navMasked);

    const validationIssues: ValidationIssue[] = [];

    let classifyResult: Awaited<ReturnType<typeof classify>> | null = null;
    let extractMasked: Awaited<ReturnType<typeof extract>> | null = null;
    let analysisMasked: Awaited<ReturnType<typeof analyze>> | null = null;

    try {
      classifyResult = await classify(provider, masked);

      if (classifyResult.confidence >= minConfidence) {
        extractMasked = await extract(provider, masked);
        const extractIssues = validateExtract(extractMasked);
        validationIssues.push(...extractIssues);

        if (!hasErrors(extractIssues)) {
          analysisMasked = await analyze(provider, navMasked, extractMasked, masked);
          const analysisIssues = validateAnalysis(analysisMasked);
          validationIssues.push(...analysisIssues);
        }
      }
    } catch (err) {
      console.warn("analysis pipeline failed:", err);
    }

    if (!analysisMasked) {
      return finalize({
        status: "error" as const,
        tier: decision.tier,
        navigator: unmaskDeep(navMasked, map),
        error: "Не удалось сгенерировать разбор. Попробуйте загрузить заново.",
        validation_issues: validationIssues,
      });
    }

    return finalize({
      status: "ok" as const,
      tier: decision.tier,
      navigator: unmaskDeep(navMasked, map),
      classify: classifyResult ?? undefined,
      extract: extractMasked ? unmaskDeep(extractMasked, map) : undefined,
      analysis: unmaskDeep(analysisMasked, map),
      validation_issues: validationIssues,
    });
  } catch (err) {
    return finalize({
      status: "error" as const,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
