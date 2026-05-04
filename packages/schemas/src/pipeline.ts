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
  type: DocumentTypeEnum,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;

// ---------- Извлечение полей ----------

// Хелпер: модель может вернуть null вместо пустой строки — нормализуем.
// На входе принимаем string | null | undefined, на выходе — всегда string.
const nullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => v ?? "");

export const MoneySchema = z.object({
  amount_rub: z.number().nullable(),
  description: nullableString,
});

export const DeadlineSchema = z.object({
  date_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  raw_text: nullableString,
  consequence: nullableString,
});

export const LegalReferenceSchema = z.object({
  code: z.enum(["NK_RF", "GK_RF", "KOAP_RF", "GPK_RF", "FZ_229", "OTHER"]),
  article: nullableString,
  raw_quote: nullableString,
});

export const ExtractOutputSchema = z.object({
  sender: nullableString,
  recipient_masked: nullableString,
  document_number: z.string().nullable(),
  document_date_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  subject_one_line: z.string().max(200),
  amounts: z.array(MoneySchema),
  deadlines: z.array(DeadlineSchema),
  legal_references: z.array(LegalReferenceSchema),
  payment_details_present: z.boolean(),
  uin: z.string().nullable(),
  not_determined_fields: z.array(z.string()),
});
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

// ---------- Финальный разбор ----------

export const ActionVariantSchema = z.object({
  title: nullableString,
  description: nullableString,
  consequences: nullableString,
});

export const AnalysisOutputSchema = z.object({
  document_summary: nullableString,
  essence_one_line: z.string().max(200),
  critical_deadline: z
    .object({
      date_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      what_to_do: nullableString,
      consequence_of_missing: nullableString,
    })
    .nullable(),
  amounts_breakdown: z.array(MoneySchema),
  legal_basis: z.array(LegalReferenceSchema),
  action_variants: z.array(ActionVariantSchema).min(2).max(5),
  authenticity_check: z.object({
    sender_looks_legitimate: z.boolean(),
    phishing_signals: z.array(z.string()),
    notes: nullableString,
  }),
  must_consult_lawyer: z.object({
    required: z.boolean(),
    reasons: z.array(z.string()),
  }),
  not_determined: z.array(z.string()),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

// ---------- Финальный результат пайплайна ----------

export const PipelineStatusEnum = z.enum([
  "ok",
  "stop_redirect_lawyer",
  "unsupported",
  "error",
]);

export const PipelineResultSchema = z.object({
  status: PipelineStatusEnum,
  classify: ClassifyOutputSchema.optional(),
  extract: ExtractOutputSchema.optional(),
  analysis: AnalysisOutputSchema.optional(),
  error: z.string().optional(),
  meta: z.object({
    prompt_version: z.string(),
    model: z.string(),
    cost_kopecks_estimate: z.number().optional(),
    duration_ms: z.number(),
  }),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
