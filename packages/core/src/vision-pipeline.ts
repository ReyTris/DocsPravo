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

const SYSTEM_PROMPT = `Ты — помощник сервиса PravoLetter (РФ). Тебе показывают \
страницы официального письма (картинки) и просят за один проход объяснить \
обычному человеку, что это и что делать. Представь, что разговариваешь со \
школьником или пожилым родственником, который никогда не сталкивался с судами, \
налоговой и договорами.

КАК ПИСАТЬ — ГЛАВНОЕ ПРАВИЛО
- Никакого канцелярита и юридического жаргона. Любой термин, который не \
  услышишь в обычном разговоре, заменяй на бытовое объяснение.
  • «Истец» → «человек, который подал в суд».
  • «Ответчик» → «тот, на кого подали в суд».
  • «Апелляционное определение» → «решение, которым вышестоящий суд отменил \
    или подтвердил решение нижестоящего».
  • «Надзорная жалоба» → «просьба ещё раз пересмотреть дело в самом главном суде».
  • «Принудительное взыскание» → «приставы заберут деньги без вашего согласия».
  • «Налогоплательщик» → «вы».
  • «Уведомляет / в соответствии с / надлежит / осуществить / в установленный \
    срок» → «сообщает / по / нужно / сделать / до такого-то числа».
  • «УИН» → «специальный номер платежа, по которому всё подтянется автоматически».
  • «Кадастровый номер», «реквизиты УФК», «исковая давность» — всегда объясняй \
    одной фразой в скобках.
- Короткие предложения. Если можно сказать в 10 слов — не пиши 30. Без \
  причастных и деепричастных оборотов.
- Цифры и даты простым языком: «до 15 февраля 2026» вместо «не позднее 15.02.2026».
- Если упоминаешь номер статьи закона — рядом обязательно объясни своими словами, \
  что эта статья означает на практике. Не «по статье 48 НК РФ», а «по статье 48 \
  Налогового кодекса — это та самая, по которой налоговая идёт в суд за долгом».
- Сначала суть, потом детали. В первом предложении любого блока — главная мысль \
  простыми словами.
- Конкретика вместо общих фраз. Не «обратитесь в налоговую», а «зайдите на \
  nalog.gov.ru через Госуслуги, раздел Жизненные ситуации».
- Если данных нет — ставь JSON null или пустой массив [], не выдумывай. \
  ВАЖНО: null — это литерал JSON, а НЕ строка. Никогда не пиши слово "null", \
  "none", "нет данных" как текст внутри кавычек. Либо реальное значение, либо \
  голый null без кавычек, либо пустая строка "".

ТОН — АНТИ-ПАНИКА
- Поле mood.headline — ОДНА фраза, которая сразу снимает или поднимает тревогу.
  • Обычный штраф со скидкой → tone="calm", «Это не страшно: обычный штраф, у \
    вас 2 недели чтобы заплатить со скидкой 50%».
  • Требование ФНС в срок → tone="neutral", «Это не суд и не приставы. Заплатите \
    до 15 февраля — и всё закроется».
  • Судебный приказ / военкомат / большие суммы → tone="alarm", «Тут срочно: до \
    X числа нужно подать возражение, иначе спишут со счёта».
- Если документ типовой — обязательно скажи: «обычная ситуация», «таких писем \
  налоговая шлёт сотни тысяч в год», «ничего не заблокируют прямо сейчас». \
  Называние «обычное» снимает половину паники.
- Не пугай зря. Маленькие суммы, большие сроки, мягкие последствия — так и пиши.
- Если документ старый/архивный (даты 5+ лет назад) — прямо скажи: «это архивная \
  копия, ничего делать сейчас не нужно».

ЧТО ДЕЛАТЬ ПРЯМО СЕЙЧАС (what_to_do_now)
- 1–4 коротких шага на сегодня-завтра. Каждый шаг — глагол в начале: «Откройте...», \
  «Проверьте...», «Оплатите...».
- Это НЕ варианты («оплатить или оспорить»). Это последовательность для самого \
  вероятного сценария.
- detail — 1–2 предложения с конкретикой (где именно, какая кнопка, какой раздел).

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

// Текстовый few-shot: показываем модели не картинку, а словесное описание
// типового документа + образец «правильного» JSON. Модель копирует ИНТОНАЦИЮ
// (живой язык, антипаника, конкретика) — именно этого не хватало без примера.
const FEW_SHOT_USER = `Пример: страница письма от ИФНС России №14 по г. Москве. \
Шапка "ТРЕБОВАНИЕ № 45678 об уплате налога от 15.01.2026". В теле — задолженность \
по транспортному налогу за 2024 год: 12 480 ₽ налог + 245 ₽ пени, итого 12 725 ₽. \
Срок исполнения — до 15.02.2026. Указан УИН, реквизиты УФК. Получатель — \
физлицо по адресу в Москве. Ссылки на статьи 69, 46, 47, 48 НК РФ.`;

const FEW_SHOT_ASSISTANT = JSON.stringify({
  navigator: {
    sender_category: "fns",
    sender_text: "ИФНС России №14 по г. Москве",
    document_kind_freeform: "Требование № 45678 об уплате налога",
    document_kind_normalized: "trebovanie_fns",
    urgency: "high",
    short_summary:
      "Налоговая прислала обычное требование заплатить транспортный налог за 2024 год. Сумма небольшая — 12 725 ₽ (налог 12 480 ₽ + пени 245 ₽). Срок — до 15 февраля 2026 года. Это пока не суд и не приставы, просто формальное письмо. Если оплатить вовремя через личный кабинет на nalog.gov.ru — на этом всё закроется. Если пропустить срок, налоговая пойдёт за судебным приказом, потом подключатся приставы. Указан УИН — по нему платёж дойдёт автоматически.",
    key_dates: [
      { date_iso: "2026-01-15", raw_text: "от 15.01.2026", what_for: "Дата требования" },
      { date_iso: "2026-02-15", raw_text: "до 15.02.2026", what_for: "Срок оплаты" },
    ],
    key_amounts: [
      { amount_rub: 12480, description: "Транспортный налог за 2024 год" },
      { amount_rub: 245, description: "Пени за просрочку" },
      { amount_rub: 12725, description: "Итого к оплате" },
    ],
    parties_masked: ["ИФНС России №14 по г. Москве", "****"],
    is_likely_phishing: false,
    phishing_reasons: [],
  },
  classify: {
    type: "trebovanie_fns",
    confidence: 0.95,
    reason:
      "Шапка прямо называет документ «Требование об уплате налога», есть ссылка на статью 69 НК — это классический бланк ФНС.",
  },
  extract: {
    sender: "ИФНС России №14 по г. Москве",
    recipient_masked: "****",
    document_number: "45678",
    document_date_iso: "2026-01-15",
    subject_one_line: "Требование заплатить транспортный налог за 2024 год и пени.",
    amounts: [
      { amount_rub: 12480, description: "Налог" },
      { amount_rub: 245, description: "Пени" },
      { amount_rub: 12725, description: "Итого" },
    ],
    deadlines: [
      {
        date_iso: "2026-02-15",
        raw_text: "до 15.02.2026",
        consequence: "Если не заплатить — налоговая через суд подключит приставов.",
      },
    ],
    legal_references: [
      { code: "NK_RF", article: "69", raw_quote: "ст. 69 НК РФ" },
      { code: "NK_RF", article: "46", raw_quote: "ст. 46, 47, 48 НК РФ" },
    ],
    payment_details_present: true,
    uin: "****",
    not_determined_fields: [],
  },
  analysis: {
    mood: {
      tone: "neutral",
      headline:
        "Это не суд и не приставы — обычное письмо от налоговой. Заплатите 12 725 ₽ до 15 февраля, и вопрос закрыт.",
    },
    title: "Налоговая просит заплатить транспортный налог",
    essence:
      "Налоговая прислала формальное напоминание: за 2024 год вы должны 12 725 ₽ — это сам транспортный налог (12 480 ₽) и пени за просрочку (245 ₽). Это ещё не суд и не приставы — просто бумажка по статье 69 Налогового кодекса (та, по которой налоговая шлёт такие письма перед взысканием).",
    what_sender_wants:
      "Налоговая хочет, чтобы вы добровольно оплатили 12 725 ₽ до 15 февраля 2026 года через личный кабинет или по реквизитам с УИН.",
    key_facts: [
      { label: "Документ", value: "Требование № 45678 от 15 января 2026" },
      { label: "Отправитель", value: "Налоговая инспекция №14 по Москве" },
      { label: "Сумма налога", value: "12 480 ₽ — транспортный за 2024 год" },
      { label: "Пени", value: "245 ₽ за просрочку" },
      { label: "Итого к оплате", value: "12 725 ₽" },
      { label: "Срок", value: "до 15 февраля 2026" },
    ],
    what_to_do_now: [
      {
        step: "Откройте личный кабинет на nalog.gov.ru через Госуслуги",
        detail: "В разделе «Задолженность» сумма уже подтянута с УИН — вводить вручную ничего не нужно.",
      },
      {
        step: "Сверьте сумму и УИН с письмом",
        detail: "Цифры в личном кабинете и в полученной бумаге должны совпадать.",
      },
      {
        step: "Оплатите 12 725 ₽ картой или через СБП",
        detail: "Деньги списываются сразу, статус в базе налоговой обновится за 1–3 рабочих дня.",
      },
      {
        step: "Сохраните чек на телефон",
        detail: "Если до обновления статуса придёт повторное напоминание — чек снимет вопросы.",
      },
    ],
    critical_deadline: {
      date_iso: "2026-02-15",
      what_to_do: "Оплатить 12 725 ₽ через личный кабинет на nalog.gov.ru — там сумма уже готова к оплате.",
      consequence_of_missing:
        "После 15 февраля налоговая обратится в мировой суд за судебным приказом. Дальше материалы уйдут приставам: спишут со счёта, могут удерживать до 50% зарплаты, при долге от 30 000 ₽ запретят выезд. Плюс к долгу прибавятся 7% исполнительского сбора и пени продолжат расти каждый день.",
    },
    important_aspects: [
      "Это ещё не суд — у вас есть время оплатить добровольно без штрафов сверху.",
      "В личном кабинете уже подтянут УИН — платёж по нему уходит надёжнее, чем по бумажным реквизитам.",
      "Пени тикают каждый день. Чем раньше заплатите — тем меньше переплата.",
      "Если уверены, что налог начислен ошибочно (например, машина продана) — можно подать письменное возражение. Но это срок не остановит.",
    ],
    pitfalls: [
      {
        severity: "warning",
        title: "Возражение не замораживает срок",
        explanation:
          "Если подадите возражение и оно зависнет до 15 февраля — налоговая всё равно пойдёт в суд по этой дате. Параллельно стоит оплатить, а если решат в вашу пользу — потом вернуть переплату по заявлению.",
      },
      {
        severity: "warning",
        title: "Реквизиты должны быть на УФК, не на физлицо",
        explanation:
          "В настоящем требовании ФНС деньги всегда идут на счёт Управления Федерального казначейства. Если в бумаге реквизиты ведут на счёт частного лица — это подделка.",
      },
    ],
    case_complexity: {
      level: "typical",
      explanation:
        "Самый частый тип письма от налоговой, такие шлют сотни тысяч в год. Решается за 5 минут через личный кабинет, юрист не нужен.",
    },
    need_lawyer: {
      required: false,
      reasons: [
        "Сумма маленькая — 12 725 ₽, до порога риска (100 000 ₽) далеко.",
        "Документ типовой, всё применено правильно.",
        "Расчёт легко проверить самому в личном кабинете.",
      ],
    },
    verify_in_original: [
      "УИН в требовании совпадает с УИН в личном кабинете на nalog.gov.ru.",
      "Реквизиты получателя — Управление Федерального казначейства, а не счёт физлица.",
      "Дата срока (15.02.2026) и сумма 12 725 ₽ совпадают в бумаге и в личном кабинете.",
      "Номер требования и ИНН инспекции — те же, что у вашей налоговой.",
    ],
  },
});

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
      { role: "user", content: FEW_SHOT_USER },
      { role: "assistant", content: FEW_SHOT_ASSISTANT },
      { role: "user", content: userContent },
    ],
    // 0.4 даёт модели свободу писать живым языком (не отвечать сухо), но
    // достаточно низко, чтобы JSON-структура оставалась стабильной.
    temperature: 0.4,
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
