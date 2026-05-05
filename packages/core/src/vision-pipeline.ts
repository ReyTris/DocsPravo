/**
 * Vision-пайплайн: один запрос к Qwen 3.6-35B (или другой VL-модели) в
 * Yandex AI Studio через OpenAI-совместимый endpoint, который принимает
 * картинки документа целиком и возвращает СРАЗУ полный разбор.
 *
 * В отличие от OCR-пайплайна:
 *  - нет отдельной OCR-стадии (модель видит изображение сама);
 *  - нет 4 LLM-вызовов (navigator → classify → extract → analyze) — всё в один запрос;
 *  - нет маскирования ПД на входе (нечего маскировать в картинке) — просим
 *    модель не возвращать персональные номера дословно в текстовых полях.
 *
 * Формат запроса — OpenAI Chat Completions с content-частями типа image_url
 * (data:image/jpeg;base64,...). Документация Yandex AI Studio:
 * https://yandex.cloud/ru/docs/ai-studio/concepts/openai-compatibility
 */

import { z } from "zod";
import {
  AnalysisOutputSchema,
  ClassifyOutputSchema,
  ExtractOutputSchema,
  NavigatorOutputSchema,
  type PipelineResult,
} from "@pravoletter/schemas";
import { route } from "./router";

export const VISION_PIPELINE_VERSION = "vision-v1";

export interface VisionImage {
  buffer: Buffer;
  mime: string; // image/jpeg | image/png
}

export interface VisionPipelineOptions {
  apiKey: string;
  folderId: string;
  /**
   * modelUri в формате `gpt://<folderId>/<model>/<version>`.
   * Для Qwen 3.6-35B в Yandex AI Studio: `gpt://<folder>/qwen3.6-35b/latest`.
   */
  modelUri: string;
  images: VisionImage[];
  /** Default 16000. Qwen3-thinking может "думать" и тратить токены до финального ответа. */
  maxTokens?: number;
  /** Default 60_000 ms. */
  timeoutMs?: number;
}

const VisionCombinedSchema = z.object({
  navigator: NavigatorOutputSchema,
  classify: ClassifyOutputSchema,
  extract: ExtractOutputSchema,
  analysis: AnalysisOutputSchema,
});

const SYSTEM_PROMPT = `Ты — юридический ассистент сервиса PravoLetter (РФ). Тебе показывают \
страницы официального документа (картинки). Твоя задача — за один проход \
выдать структурированный разбор.

ВАЖНО ПРО ПЕРСОНАЛЬНЫЕ ДАННЫЕ:
В выходном JSON НЕ возвращай дословно: серии и номера паспортов, СНИЛС, \
полные ИНН физлиц (>10 цифр оставляй как ****), телефоны, домашние адреса. \
Заменяй такие фрагменты звёздочками "****". Юрлица, ОГРН, ИНН организаций, \
номера документов отправителя — оставляй как есть.

ОТВЕТ — ТОЛЬКО ВАЛИДНЫЙ JSON по схеме:
{
  "navigator": {
    "sender_category": "fns|fssp|court|police|voenkomat|bank|mfo|kollektor|gibdd|uk_zhkh|soczashita|ofms|rospotreb|private|unknown",
    "sender_text": "дословный текст отправителя",
    "document_kind_freeform": "как сам документ себя называет",
    "document_kind_normalized": "trebovanie_fns|uvedomlenie_fns|trebovanie_poyasneniy|akt_kameralnoy|reshenie_fns|uvedomlenie_o_zadolzhennosti|postanovlenie_fssp|shtraf_gibdd|pretenziya_bank|pererashet_jkh|sudebnyy_prikaz|povestka_voenkomat|ugolovnoe|drugoye",
    "urgency": "critical|high|medium|low|unknown",
    "short_summary": "5-10 предложений простым языком: что это, что хотят, какие даты и суммы, что будет если игнорировать",
    "key_dates": [{"date_iso":"YYYY-MM-DD|null","raw_text":"...","what_for":"..."}],
    "key_amounts": [{"amount_rub": number|null, "description":"..."}],
    "parties_masked": ["..."],
    "is_likely_phishing": false,
    "phishing_reasons": []
  },
  "classify": {
    "type": "trebovanie_fns|uvedomlenie_fns|trebovanie_poyasneniy|akt_kameralnoy|reshenie_fns|sudebnyy_prikaz|povestka_voenkomat|ugolovnoe|drugoy_no_fns|ne_fns|ne_opredelen",
    "confidence": 0.0,
    "reason": "почему именно этот тип"
  },
  "extract": {
    "sender": "...",
    "recipient_masked": "Иванов И. И.",
    "document_number": "...|null",
    "document_date_iso": "YYYY-MM-DD|null",
    "subject_one_line": "...|null",
    "amounts": [{"amount_rub": number|null, "description":"..."}],
    "deadlines": [{"date_iso":"YYYY-MM-DD|null","raw_text":"...","consequence":"..."}],
    "legal_references": [{"code":"NK_RF|GK_RF|KOAP_RF|GPK_RF|FZ_229|OTHER","article":"...","raw_quote":"..."}],
    "payment_details_present": true|false|null,
    "uin": "...|null",
    "not_determined_fields": []
  },
  "analysis": {
    "mood": {"tone":"calm|neutral|alarm","headline":"одна фраза"},
    "title": "короткий заголовок разбора",
    "essence": "1-2 предложения сути",
    "what_sender_wants": "чего хотят от получателя",
    "key_facts": [{"label":"...","value":"..."}],
    "what_to_do_now": [{"step":"...","detail":"..."}],
    "critical_deadline": {"date_iso":"YYYY-MM-DD|null","what_to_do":"...","consequence_of_missing":"..."},
    "important_aspects": ["..."],
    "pitfalls": [{"severity":"info|warning|danger","title":"...","explanation":"..."}],
    "case_complexity": {"level":"typical|complex","explanation":"..."},
    "need_lawyer": {"required": false, "reasons": []},
    "verify_in_original": ["..."]
  }
}

КРИТИЧНО: ответ — ТОЛЬКО сырой JSON. Никаких комментариев, никаких \
markdown-блоков ${"`"}${"`"}${"`"}json${"`"}${"`"}${"`"}, никакого текста до или после.`;

export async function runVisionPipeline(
  opts: VisionPipelineOptions,
): Promise<PipelineResult> {
  const t0 = Date.now();
  const maxTokens = opts.maxTokens ?? 16000;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const baseMeta = {
    prompt_version: VISION_PIPELINE_VERSION,
    model: opts.modelUri,
    duration_ms: 0,
  };
  const finalize = <T extends object>(r: T): PipelineResult =>
    ({
      ...r,
      meta: { ...baseMeta, duration_ms: Date.now() - t0 },
    }) as unknown as PipelineResult;

  if (opts.images.length === 0) {
    return finalize({ status: "error" as const, error: "Нет страниц для разбора" });
  }

  // Собираем сообщение: текст-инструкция + N картинок.
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text:
        opts.images.length === 1
          ? "Разбери этот документ и верни JSON по схеме."
          : `Разбери документ из ${opts.images.length} страниц. Страницы идут в правильном порядке. Верни ОДИН общий JSON по схеме.`,
    },
    ...opts.images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mime};base64,${img.buffer.toString("base64")}`,
      },
    })),
  ];

  const body = {
    model: opts.modelUri,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0,
    max_tokens: maxTokens,
    stream: false,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let raw: string;
  try {
    const res = await fetch("https://llm.api.cloud.yandex.net/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${opts.apiKey}`,
        "x-folder-id": opts.folderId,
        "x-data-logging-enabled": "false",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      return finalize({
        status: "error" as const,
        error: `Yandex AI Studio ${res.status}: ${text.slice(0, 500)}`,
      });
    }
    const json = (await res.json()) as {
      choices: Array<{
        message: { content: string; reasoning_content?: string };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    raw = json.choices[0]?.message.content ?? "";
    if (!raw.trim()) {
      // Диагностика: thinking-модели могут забить весь бюджет токенов
      // на размышления и не успеть дать финальный ответ.
      console.warn(
        "[vision] empty content. finish_reason=" +
          (json.choices[0]?.finish_reason ?? "?") +
          " usage=" +
          JSON.stringify(json.usage ?? {}) +
          " hasReasoning=" +
          Boolean(json.choices[0]?.message.reasoning_content) +
          " rawSnippet=" +
          JSON.stringify(json).slice(0, 800),
      );
    }
  } catch (err) {
    return finalize({
      status: "error" as const,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!raw.trim()) {
    return finalize({ status: "error" as const, error: "Пустой ответ модели" });
  }

  const parsed = safeParseJson(raw);
  if (!parsed) {
    return finalize({
      status: "error" as const,
      error: "Не удалось распарсить JSON ответа модели",
    });
  }

  const validated = VisionCombinedSchema.safeParse(parsed);
  if (!validated.success) {
    return finalize({
      status: "error" as const,
      error: `Ответ не соответствует схеме: ${validated.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    });
  }

  const { navigator, classify, extract, analysis } = validated.data;
  const decision = route(navigator);

  return finalize({
    status: "ok" as const,
    tier: decision.tier,
    navigator,
    classify,
    extract,
    analysis,
  });
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Попытка 1: сырой JSON
  try {
    return JSON.parse(trimmed);
  } catch {}
  // Попытка 2: markdown-fences
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {}
  }
  // Попытка 3: первый { до последнего }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {}
  }
  return null;
}
