/**
 * Оркестратор промт-цепочки.
 *
 * Шаги:
 *   0. (Внешне) OCR — на вход приходит уже текст.
 *   1. Маскирование ПД.
 *   2. Классификация.
 *   2.5. Гейт безопасности (стоп-типы → редирект к юристу).
 *   3. Извлечение полей (только для поддерживаемых типов).
 *   4. Валидация извлечённого.
 *   5. Финальный разбор.
 *   6. Валидация разбора.
 *   7. Обратная подстановка ПД.
 */

import { classify } from "./steps/classify";
import { extract } from "./steps/extract";
import { analyze } from "./steps/analyze";
import { maskPii, unmaskDeep } from "./pii";
import { hasErrors, validateAnalysis, validateExtract, type ValidationIssue } from "./validators";
import { STOP_TYPES, SUPPORTED_TYPES, type PipelineResult } from "@pravoletter/schemas";
import type { LLMProvider } from "./providers/llm";

export const PIPELINE_VERSION = "pipeline-v1";

export interface RunOptions {
  /** Минимальная уверенность классификатора, чтобы продолжать. Иначе — unsupported. */
  minClassifyConfidence?: number;
}

export async function runPipeline(
  provider: LLMProvider,
  ocrText: string,
  options: RunOptions = {},
): Promise<PipelineResult & { validation_issues?: ValidationIssue[] }> {
  const t0 = Date.now();
  const minConfidence = options.minClassifyConfidence ?? 0.7;

  try {
    // ШАГ 1: маскирование ПД
    const { masked, map } = maskPii(ocrText);

    // ШАГ 2: классификация (на маскированном тексте)
    const classifyResult = await classify(provider, masked);

    // ШАГ 2.5: гейт безопасности
    if (STOP_TYPES.includes(classifyResult.type)) {
      return {
        status: "stop_redirect_lawyer",
        classify: classifyResult,
        meta: {
          prompt_version: PIPELINE_VERSION,
          model: provider.name,
          duration_ms: Date.now() - t0,
        },
      };
    }
    if (
      !SUPPORTED_TYPES.includes(classifyResult.type) ||
      classifyResult.confidence < minConfidence
    ) {
      return {
        status: "unsupported",
        classify: classifyResult,
        meta: {
          prompt_version: PIPELINE_VERSION,
          model: provider.name,
          duration_ms: Date.now() - t0,
        },
      };
    }

    // ШАГ 3: извлечение
    const extractMasked = await extract(provider, masked);

    // ШАГ 4: валидация извлечённого
    const extractIssues = validateExtract(extractMasked);
    if (hasErrors(extractIssues)) {
      return {
        status: "error",
        classify: classifyResult,
        extract: extractMasked,
        error: `Ошибки валидации извлечения: ${extractIssues.map((i) => i.message).join("; ")}`,
        meta: {
          prompt_version: PIPELINE_VERSION,
          model: provider.name,
          duration_ms: Date.now() - t0,
        },
        validation_issues: extractIssues,
      };
    }

    // ШАГ 5: финальный разбор
    const analysisMasked = await analyze(provider, extractMasked);

    // ШАГ 6: валидация разбора
    const analysisIssues = validateAnalysis(analysisMasked);
    if (hasErrors(analysisIssues)) {
      return {
        status: "error",
        classify: classifyResult,
        extract: extractMasked,
        analysis: analysisMasked,
        error: `Ошибки валидации разбора: ${analysisIssues.map((i) => i.message).join("; ")}`,
        meta: {
          prompt_version: PIPELINE_VERSION,
          model: provider.name,
          duration_ms: Date.now() - t0,
        },
        validation_issues: analysisIssues,
      };
    }

    // ШАГ 7: обратная подстановка ПД
    const extractFinal = unmaskDeep(extractMasked, map);
    const analysisFinal = unmaskDeep(analysisMasked, map);

    return {
      status: "ok",
      classify: classifyResult,
      extract: extractFinal,
      analysis: analysisFinal,
      meta: {
        prompt_version: PIPELINE_VERSION,
        model: provider.name,
        duration_ms: Date.now() - t0,
      },
      validation_issues: [...extractIssues, ...analysisIssues],
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      meta: {
        prompt_version: PIPELINE_VERSION,
        model: provider.name,
        duration_ms: Date.now() - t0,
      },
    };
  }
}
