/**
 * Zod-схемы LLM-выходов и финального результата промт-цепочки.
 * Эти же схемы используются на фронте (web, future mobile) для типизации UI.
 */

import { z } from "zod";

// ---------- Классификация ----------

export const DocumentTypeEnum = z.enum([
  "trebovanie_fns",
  "uvedomlenie_fns",
  "trebovanie_poyasneniy",
  "akt_kameralnoy",
  "reshenie_fns",
  "sudebnyy_prikaz",
  "povestka_voenkomat",
  "ugolovnoe",
  "drugoy_no_fns",
  "ne_fns",
  "ne_opredelen",
]);
export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const STOP_TYPES: DocumentType[] = [
  "sudebnyy_prikaz",
  "povestka_voenkomat",
  "ugolovnoe",
];

export const SUPPORTED_TYPES: DocumentType[] = [
  "trebovanie_fns",
  "uvedomlenie_fns",
  "trebovanie_poyasneniy",
];

export const ClassifyOutputSchema = z.object({
  // Толерантно к опечаткам/синонимам: незнакомое значение → "ne_opredelen",
  // чтобы не валить весь разбор из-за расхождения в одну букву.
  type: DocumentTypeEnum.catch("ne_opredelen"),
  confidence: z.number().min(0).max(1).catch(0),
  reason: z.string().max(300).catch(""),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;

// ---------- Извлечение полей ----------

// Хелпер: модель может вернуть null вместо пустой строки — нормализуем.
// Также LLM иногда пишет литералы как текст ("null", "none", "нет данных") —
// тоже превращаем в пустую строку, чтобы UI не показывал слово "null".
// На входе принимаем string | null | undefined, на выходе — всегда string.
const NULLISH_LITERALS = new Set([
  "null",
  "none",
  "n/a",
  "na",
  "undefined",
  "нет",
  "нет данных",
  "не указано",
  "не определено",
  "—",
  "-",
]);
const nullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return "";
    const trimmed = v.trim();
    if (NULLISH_LITERALS.has(trimmed.toLowerCase())) return "";
    return v;
  });

// Толерантная ISO-дата: либо строка вида YYYY-MM-DD, либо null.
// Если LLM вернёт «31.12.2011», «2011-XX-YY», пустую строку или произвольный
// текст — нормализуем в null. Оригинальная формулировка обычно сохраняется
// в соседнем поле raw_text/raw_quote, так что данные не теряются.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const nullableIsoDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const trimmed = v.trim();
    return ISO_DATE_RE.test(trimmed) ? trimmed : null;
  });

export const MoneySchema = z.object({
  amount_rub: z.number().nullable(),
  description: nullableString,
});

export const DeadlineSchema = z.object({
  date_iso: nullableIsoDate,
  raw_text: nullableString,
  consequence: nullableString,
});

export const LegalReferenceSchema = z.object({
  code: z
    .enum(["NK_RF", "GK_RF", "KOAP_RF", "GPK_RF", "FZ_229", "OTHER"])
    .catch("OTHER"),
  article: nullableString,
  raw_quote: nullableString,
});

export const ExtractOutputSchema = z.object({
  sender: nullableString,
  recipient_masked: nullableString,
  document_number: z.string().nullish().transform((v) => v ?? null),
  document_date_iso: nullableIsoDate,
  subject_one_line: z.string().max(200).nullable().catch(null),
  amounts: z.array(MoneySchema).catch([]),
  deadlines: z.array(DeadlineSchema).catch([]),
  legal_references: z.array(LegalReferenceSchema).catch([]),
  payment_details_present: z.boolean().nullable().catch(null),
  uin: z.string().nullish().transform((v) => v ?? null),
  not_determined_fields: z.array(z.string()).catch([]),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

// ---------- Финальный разбор (плоский, без тарифов) ----------
// Один уровень разбора: простой пересказ + важные аспекты + подводные камни.

const PitfallSeverityEnum = z.enum(["info", "warning", "danger"]).catch("info");

const MoodEnum = z.enum(["calm", "neutral", "alarm"]).catch("neutral");
const ComplexityEnum = z.enum(["typical", "complex"]).catch("typical");

export const AnalysisOutputSchema = z.object({
  // Шапка-настроение: одна фраза, которая сразу успокаивает или настораживает.
  mood: z
    .object({
      tone: MoodEnum,
      headline: nullableString,
    })
    .nullish()
    .transform((v) => v ?? null),
  title: nullableString,
  essence: nullableString,
  what_sender_wants: nullableString,
  key_facts: z
    .array(
      z.object({
        label: nullableString,
        value: nullableString,
      }),
    )
    .default([]),
  // Что сделать ПРЯМО СЕЙЧАС — короткий чек-лист действий.
  what_to_do_now: z
    .array(
      z.object({
        step: nullableString,
        detail: nullableString,
      }),
    )
    .default([]),
  critical_deadline: z
    .object({
      date_iso: nullableIsoDate,
      what_to_do: nullableString,
      consequence_of_missing: nullableString,
    })
    .nullish()
    .transform((v) => v ?? null),
  important_aspects: z.array(z.string()).default([]),
  pitfalls: z
    .array(
      z.object({
        severity: PitfallSeverityEnum,
        title: nullableString,
        explanation: nullableString,
      }),
    )
    .default([]),
  // Уровень сложности кейса — типовой или сложный, и почему.
  case_complexity: z
    .object({
      level: ComplexityEnum,
      explanation: nullableString,
    })
    .nullish()
    .transform((v) => v ?? null),
  need_lawyer: z
    .object({
      required: z.boolean(),
      reasons: z.array(z.string()).default([]),
    })
    .nullable()
    .catch(null),
  verify_in_original: z.array(z.string()).default([]),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

// ---------- Универсальный навигатор (Layer 1) ----------
// Работает на ЛЮБОМ документе. Возвращает структурированный пересказ без
// юридической интерпретации, без рекомендаций, без статей закона.
// Это безопасный «paraphrase», который мы можем показать всегда.

export const SenderCategoryEnum = z.enum([
  "fns",         // ФНС
  "fssp",        // ФССП — приставы
  "court",       // Любой суд (включая мировой)
  "police",      // МВД, СК, прокуратура
  "voenkomat",   // Военкомат
  "bank",        // Банк
  "mfo",         // Микрофинансы
  "kollektor",   // Коллекторы
  "gibdd",       // ГИБДД
  "uk_zhkh",     // УК, ТСЖ, ресурсники
  "soczashita",  // Соцзащита, ПФР, СФР
  "ofms",        // Миграционная служба
  "rospotreb",   // Роспотребнадзор и др. надзоры
  "private",     // Частное лицо или организация без статуса гос
  "unknown",
]);
export type SenderCategory = z.infer<typeof SenderCategoryEnum>;

// Толерантная версия для парсинга LLM-вывода: незнакомое значение → "unknown"
export const SenderCategoryTolerant = SenderCategoryEnum.catch("unknown");

export const UrgencyEnum = z.enum([
  "critical",  // суд, военкомат, уголовка — любая ошибка дорогая
  "high",      // ФНС-69, ФССП постановления, штрафы — пропуск срока вреден
  "medium",    // банк, ЖКХ — есть деньги или сроки, но обычно гибко
  "low",       // информационные, нет требований
  "unknown",
]);
export type Urgency = z.infer<typeof UrgencyEnum>;
export const UrgencyTolerant = UrgencyEnum.catch("unknown");

export const TierEnum = z.enum([
  "green",   // полный разбор, тип в зелёном списке (ФНС-требования и уведомления)
  "yellow",  // полный разбор, тип вне зелёного списка (банк, ЖКХ, частные)
  "red",     // полный разбор + расширенные предупреждения в UI (суд, военкомат, уголовка)
]);
export type Tier = z.infer<typeof TierEnum>;

export const NavigatorOutputSchema = z.object({
  sender_category: SenderCategoryTolerant,
  sender_text: nullableString.describe("Дословный текст отправителя"),
  document_kind_freeform: nullableString.describe("Как сам документ себя называет"),
  // Канонический тип. Если LLM вернёт что-то вне списка — нормализуем до "drugoye".
  document_kind_normalized: z
    .string()
    .transform((v) => {
      const allowed = new Set([
        "trebovanie_fns",
        "uvedomlenie_fns",
        "trebovanie_poyasneniy",
        "akt_kameralnoy",
        "reshenie_fns",
        "uvedomlenie_o_zadolzhennosti",
        "postanovlenie_fssp",
        "shtraf_gibdd",
        "pretenziya_bank",
        "pererashet_jkh",
        "sudebnyy_prikaz",
        "povestka_voenkomat",
        "ugolovnoe",
        "drugoye",
      ]);
      return allowed.has(v) ? v : "drugoye";
    }),
  urgency: UrgencyTolerant,
  short_summary: nullableString.describe(
    "Развёрнутый пересказ документа простым языком (5-10 предложений) с ключевыми датами, суммами и последствиями",
  ),
  key_dates: z.array(
    z.object({
      date_iso: nullableIsoDate,
      raw_text: nullableString,
      what_for: nullableString,
    }),
  ),
  key_amounts: z.array(MoneySchema),
  parties_masked: z.array(nullableString).describe("Стороны с замаскированными ПД"),
  is_likely_phishing: z.boolean(),
  phishing_reasons: z.array(z.string()),
  fraud_action_plan: z
    .array(z.object({ step: z.string(), detail: z.string() }))
    .default([]),
});
export type NavigatorOutput = z.infer<typeof NavigatorOutputSchema>;

// ---------- Yellow-tier пересказ (Layer 2 для непрофильных типов) ----------
// Усиленный навигатор: добавляет «что обычно делает получатель» и чек-лист
// проверки, но БЕЗ конкретных статей закона и БЕЗ рекомендации действий.

export const YellowSummaryOutputSchema = z.object({
  what_this_document_is: nullableString.describe("Что это за документ обычными словами"),
  what_sender_wants: nullableString.describe("Чего отправитель хочет от получателя"),
  key_facts: z
    .array(
      z.object({
        label: nullableString,
        value: nullableString,
        source: z.enum(["from_document", "general_knowledge"]).catch("from_document"),
      }),
    )
    .default([]),
  things_to_verify: z
    .array(z.string())
    .default([])
    .describe("Чек-лист: что получатель должен проверить в оригинале"),
  why_lawyer_recommended: nullableString.describe(
    "Почему по такому документу лучше обратиться к юристу (не общая фраза, а конкретно по делу)",
  ),
});
export type YellowSummaryOutput = z.infer<typeof YellowSummaryOutputSchema>;

// ---------- Стилизация (опциональный «прикол» поверх разбора) ----------
// Стиль не меняет суть разбора — это отдельный текстовый пересказ заголовка
// и эссенции документа в выбранном тоне. Юридически значимая версия всегда
// остаётся в analysis.mood + analysis.essence.

export const StyleEnum = z.enum([
  "normal",  // без стилизации
  "gopnik",  // блатняк-братан с района
  "yoda",    // Магистр Йода
]);
export type Style = z.infer<typeof StyleEnum>;

export const StylizedOutputSchema = z.object({
  style: StyleEnum,
  headline: nullableString.describe("Стилизованный аналог mood.headline — одна-две фразы"),
  summary: nullableString.describe("Стилизованный аналог essence — 3-6 предложений"),
  what_sender_wants: nullableString.describe("Стилизованный пересказ what_sender_wants"),
  steps: z
    .array(
      z.object({
        step: nullableString,
        detail: nullableString,
      }),
    )
    .default([])
    .describe("Стилизованные шаги what_to_do_now (тот же порядок и количество)"),
  important_aspects: z
    .array(z.string())
    .default([])
    .describe("Стилизованные important_aspects (тот же порядок и количество)"),
  pitfalls: z
    .array(
      z.object({
        title: nullableString,
        explanation: nullableString,
      }),
    )
    .default([])
    .describe("Стилизованные pitfalls (тот же порядок и количество, severity не передаётся)"),
  case_complexity_explanation: nullableString.describe(
    "Стилизованный case_complexity.explanation",
  ),
  key_facts: z
    .array(
      z.object({
        label: nullableString,
        value: nullableString,
      }),
    )
    .default([])
    .describe("Стилизованные key_facts (тот же порядок и количество)"),
  critical_deadline: z
    .object({
      what_to_do: nullableString,
      consequence_of_missing: nullableString,
    })
    .nullable()
    .default(null)
    .describe("Стилизованный critical_deadline (date_iso не передаётся)"),
  verify_in_original: z
    .array(z.string())
    .default([])
    .describe("Стилизованный verify_in_original (тот же порядок и количество)"),
  need_lawyer_reasons: z
    .array(z.string())
    .default([])
    .describe("Стилизованные need_lawyer.reasons (тот же порядок и количество)"),
  navigator_summary: nullableString.describe(
    "Стилизованный navigator.short_summary — пересказ документа простым языком",
  ),
  navigator_sender_text: nullableString.describe(
    "Стилизованный navigator.sender_text — название/описание отправителя (имена органов сохрани дословно)",
  ),
  navigator_document_kind: nullableString.describe(
    "Стилизованный navigator.document_kind_freeform — как сам документ себя называет",
  ),
  navigator_key_dates_what_for: z
    .array(z.string())
    .default([])
    .describe(
      "Стилизованные подписи navigator.key_dates[].what_for, тот же порядок и длина (date_iso/raw_text не передаются)",
    ),
  navigator_key_amounts_description: z
    .array(z.string())
    .default([])
    .describe(
      "Стилизованные navigator.key_amounts[].description, тот же порядок и длина (amount_rub не передаётся)",
    ),
});
export type StylizedOutput = z.infer<typeof StylizedOutputSchema>;

// ---------- Финальный результат пайплайна ----------

export const PipelineStatusEnum = z.enum([
  "ok",
  "unsupported",
  "error",
]);
export type PipelineStatus = z.infer<typeof PipelineStatusEnum>;

export const PipelineResultSchema = z.object({
  status: PipelineStatusEnum,
  tier: TierEnum.optional(),
  navigator: NavigatorOutputSchema.optional(),
  classify: ClassifyOutputSchema.optional(),
  extract: ExtractOutputSchema.optional(),
  analysis: AnalysisOutputSchema.optional(),
  // Краткий fallback-пересказ: появляется когда полный analyze недоступен
  yellow_summary: YellowSummaryOutputSchema.optional(),
  stylized: StylizedOutputSchema.optional(),
  error: z.string().optional(),
  meta: z.object({
    prompt_version: z.string(),
    model: z.string(),
    cost_kopecks_estimate: z.number().optional(),
    duration_ms: z.number(),
  }),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
