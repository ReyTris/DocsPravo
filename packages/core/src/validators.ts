/**
 * Валидаторы выходных данных, выполняющиеся ПОСЛЕ LLM. Защита от галлюцинаций и опасных формулировок.
 */

import type { AnalysisOutput, ExtractOutput } from "@pravoletter/schemas";

// Запрещённые в разборе обороты (нарушают принцип "информирование, а не консультация")
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bгарантирую\b/i,
  /\bвы\s+(точно\s+)?выиграете\b/i,
  /\bне\s+страшно\b/i,
  /\bничего\s+не\s+будет\b/i,
  /\bсмело\s+игнорируйте\b/i,
  /\b100%\b/,
  /\bэто\s+законно\s+на\s+100%/i,
];

// Допустимые редакции упомянутых статей НК РФ (white-list для требования ФНС).
// Расширять при добавлении новых типов документов.
const ALLOWED_NK_ARTICLES = new Set([
  "31", "32", "44", "45", "46", "47", "48", "52", "57", "69", "70", "75", "88", "100", "101",
]);

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export function validateExtract(ext: ExtractOutput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const ref of ext.legal_references) {
    if (ref.code === "NK_RF" && !ALLOWED_NK_ARTICLES.has(ref.article)) {
      issues.push({
        code: "unknown_nk_article",
        message: `Упомянута неизвестная статья НК РФ: ${ref.article}. Возможна галлюцинация.`,
        severity: "warning",
      });
    }
  }

  for (const dl of ext.deadlines) {
    if (dl.date_iso) {
      const d = new Date(dl.date_iso);
      if (Number.isNaN(d.getTime())) {
        issues.push({
          code: "invalid_deadline",
          message: `Невалидная дата срока: ${dl.date_iso}`,
          severity: "error",
        });
      }
    }
  }

  for (const a of ext.amounts) {
    if (a.amount_rub !== null && a.amount_rub < 0) {
      issues.push({
        code: "negative_amount",
        message: `Отрицательная сумма: ${a.amount_rub}`,
        severity: "error",
      });
    }
  }

  return issues;
}

export function validateAnalysis(an: AnalysisOutput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allText = JSON.stringify(an);
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(allText)) {
      issues.push({
        code: "forbidden_phrase",
        message: `Найдена запрещённая формулировка по паттерну: ${re}`,
        severity: "error",
      });
    }
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
