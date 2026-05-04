/**
 * Оркестратор гибридной промт-цепочки.
 *
 * Шаги:
 *   1. Маскирование ПД (regex).
 *   2. Универсальный навигатор (любой документ → структурированный пересказ).
 *   3. Маршрутизатор (код): green / yellow / red.
 *   4a. GREEN  → старая специализированная цепочка (classify → extract → analyze).
 *   4b. YELLOW → безопасный пересказ (yellow-summary).
 *   4c. RED    → стоп, экран "к юристу".
 *   5. Валидация и обратная подстановка ПД.
 */

import { classify } from "./steps/classify";
import { extract } from "./steps/extract";
import { analyze } from "./steps/analyze";
import { navigate } from "./steps/navigator";
import { summarizeYellow } from "./steps/yellow-summary";
import { route } from "./router";
import { maskPii, unmaskDeep } from "./pii";
import {
  hasErrors,
  validateAnalysis,
  validateExtract,
  type ValidationIssue,
} from "./validators";
import { type PipelineResult } from "@pravoletter/schemas";
import type { LLMProvider } from "./providers/llm";

export const PIPELINE_VERSION = "pipeline-v2-hybrid";

export interface RunOptions {
  /** Минимальная уверенность классификатора в green-ветке. По умолчанию 0.7. */
  minClassifyConfidence?: number;
}

export async function runPipeline(
  provider: LLMProvider,
  ocrText: string,
  options: RunOptions = {},
): Promise<PipelineResult & { validation_issues?: ValidationIssue[] }> {
  const t0 = Date.now();
  const minConfidence = options.minClassifyConfidence ?? 0.7;
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

    // ШАГ 3: маршрутизация
    const decision = route(navMasked);

    // ШАГ 4c: RED — стоп
    if (decision.tier === "red") {
      const navFinal = unmaskDeep(navMasked, map);
      return finalize({
        status: "stop_redirect_lawyer" as const,
        tier: "red" as const,
        navigator: navFinal,
      });
    }

    // ШАГ 4a: GREEN — специализированный разбор
    if (decision.tier === "green") {
      const classifyResult = await classify(provider, masked);
      if (classifyResult.confidence < minConfidence) {
        // Несмотря на сигнал navigator-а, классификатор не уверен — деградируем в yellow
        const yellowMasked = await summarizeYellow(provider, navMasked, masked);
        return finalize({
          status: "ok_yellow" as const,
          tier: "yellow" as const,
          navigator: unmaskDeep(navMasked, map),
          yellow_summary: unmaskDeep(yellowMasked, map),
        });
      }

      const extractMasked = await extract(provider, masked);
      const extractIssues = validateExtract(extractMasked);
      if (hasErrors(extractIssues)) {
        return finalize({
          status: "error" as const,
          tier: "green" as const,
          navigator: unmaskDeep(navMasked, map),
          classify: classifyResult,
          extract: extractMasked,
          error: `Ошибки валидации извлечения: ${extractIssues.map((i) => i.message).join("; ")}`,
          validation_issues: extractIssues,
        });
      }

      const analysisMasked = await analyze(provider, extractMasked);
      const analysisIssues = validateAnalysis(analysisMasked);
      if (hasErrors(analysisIssues)) {
        return finalize({
          status: "error" as const,
          tier: "green" as const,
          navigator: unmaskDeep(navMasked, map),
          classify: classifyResult,
          extract: extractMasked,
          analysis: analysisMasked,
          error: `Ошибки валидации разбора: ${analysisIssues.map((i) => i.message).join("; ")}`,
          validation_issues: analysisIssues,
        });
      }

      return finalize({
        status: "ok_green" as const,
        tier: "green" as const,
        navigator: unmaskDeep(navMasked, map),
        classify: classifyResult,
        extract: unmaskDeep(extractMasked, map),
        analysis: unmaskDeep(analysisMasked, map),
        validation_issues: [...extractIssues, ...analysisIssues],
      });
    }

    // ШАГ 4b: YELLOW — безопасный пересказ
    const yellowMasked = await summarizeYellow(provider, navMasked, masked);
    return finalize({
      status: "ok_yellow" as const,
      tier: "yellow" as const,
      navigator: unmaskDeep(navMasked, map),
      yellow_summary: unmaskDeep(yellowMasked, map),
    });
  } catch (err) {
    return finalize({
      status: "error" as const,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
