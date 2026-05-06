/**
 * Стилизация разбора. Берёт уже готовый AnalysisOutput и переписывает заголовок
 * (mood.headline) + суть (essence) в выбранном стиле.
 *
 * Юридически значимые поля (даты, суммы, статьи, реквизиты) НЕ меняются —
 * стилизованный текст идёт отдельно от основного analysis и ни на что не влияет.
 * Если стилизация упала — пайплайн остаётся валидным, просто без stylized-блока.
 */

import type { LLMProvider } from "../providers/llm";
import {
  StylizedOutputSchema,
  type AnalysisOutput,
  type NavigatorOutput,
  type Style,
  type StylizedOutput,
} from "@pravoletter/schemas";

export const STYLIZE_PROMPT_VERSION = "stylize-v1";

const STYLE_INSTRUCTIONS: Record<Exclude<Style, "normal">, string> = {
  gopnik: `Стиль: «БЛАТНЯК-БРАТАН С РАЙОНА».
- Говори как пацан с района конца 90-х: «короче», «братан», «по понятиям», «впрягаться»,
  «движуха», «в натуре», «не парься», «зашквар», «спалят», «решалово», «по-братски».
- Бюрократов и государственных называй так, как назвал бы их сосед на лавке: налоговая —
  «налоговики», суд — «суд», приставы — «приставы», банк — «банкиры». Без оскорблений.
- Не ругайся матом. Без блатной романтики (никаких «пацан сказал — пацан сделал»).
  Просто разговорная речь района.
- Обращайся к получателю на «ты», как к корешу.`,

  yoda: `Стиль: «МАГИСТР ЙОДА».
- Инверсивный порядок слов как в русском дубляже Звёздных Войн: «Заплатить ты должен»,
  «Серьёзным дело это не является», «Срок до пятнадцатого февраля имеешь ты».
- Лексика спокойная, мудрая, чуть архаичная. Слова: «юный падаван», «Сила», «путь»,
  «терпение», «мудрость», «тёмная сторона». Не перебарщивай — 1-2 отсылки на весь текст.
- Без современного сленга и канцелярита.
- Тон — наставительный, успокаивающий, но честный про последствия.`,

  drunk_lawyer: `Стиль: «ПЬЯНЫЙ СОСЕД-ЮРИСТ НА КУХНЕ».
- Сосед, который двадцать лет в адвокатуре, сегодня выпил, сидит на кухне и объясняет
  «по-человечески, без этих ваших формулировок».
- Ход мысли скачет: вставляет «ну вот смотри», «короче ты слушай сюда», «я тебе щас
  объясню как есть», «да я в девяносто восьмом такие дела пачками закрывал», «не,
  ну ты понял да?».
- Иногда уходит в сторону на полпредложения и возвращается. Но СУТЬ держит — даты,
  суммы, последствия называет точно.
- Без мата, без оскорблений в адрес госорганов. Слегка иронично, но дружелюбно.
- Обращается на «ты», по-свойски.`,
};

const SYSTEM_BASE = `Ты переписываешь готовый разбор официального документа в заданном стиле.
Тебе передадут все ключевые текстовые блоки разбора в обычном стиле и инструкцию по
стилю. Твоя задача — вернуть стилизованные версии этих блоков, СОХРАНЯЯ структуру:
тот же порядок шагов, та же длина массивов, тот же смысл.

ЖЕЛЕЗНЫЕ ПРАВИЛА — НИКОГДА НЕ НАРУШАЙ
1. Сохраняй ВСЕ цифры дословно: суммы в рублях, даты (формата 15.02.2026 или 2026-02-15),
   номера статей, проценты, сроки. Не округляй, не пиши «примерно», «около».
2. Сохраняй названия органов и документов (ФНС, ФССП, суд, военкомат, требование,
   постановление, Госуслуги, nalog.gov.ru). Можно добавить разговорный синоним рядом,
   но оригинальное название должно остаться узнаваемым.
3. Не добавляй фактов, которых нет в исходнике. Не выдумывай статьи, советы, цифры,
   реквизиты, сайты.
4. Не меняй смысл. Если в исходнике «не страшно» — стилизация не должна звучать как
   «всё пропало». Если «срочно» — не должна звучать как «забей».
5. Сохраняй токены маскирования персональных данных как есть: [ФИО_1], [ИНН_1],
   [УИН_1], [АДРЕС_1] и т.п. Не заменяй на реальные имена.
6. Длина массивов steps/important_aspects/pitfalls должна СТРОГО совпадать с исходником
   и идти в том же порядке. Каждый элемент стилизуется индивидуально.
7. Если на входе массив пустой — на выходе тоже пустой. Если поле пустое (null/"") —
   на выходе тоже пустое.
8. Без мата и оскорблений. Без угроз. Без призывов нарушать закон.

ФОРМАТ ОТВЕТА — строго JSON по схеме:
{
  "style": "<тот же style, что в инструкции>",
  "headline": "стилизованный mood.headline (1-2 фразы)",
  "summary": "стилизованная essence (3-6 предложений)",
  "navigator_summary": "стилизованный navigator.short_summary (5-10 предложений с фактами)",
  "what_sender_wants": "стилизованный what_sender_wants (1-3 предложения)",
  "steps": [
    { "step": "стилизованный step", "detail": "стилизованный detail" }
  ],
  "important_aspects": ["стилизованный пункт 1", "..."],
  "pitfalls": [
    { "title": "стилизованный title", "explanation": "стилизованное explanation" }
  ],
  "case_complexity_explanation": "стилизованный case_complexity.explanation",
  "key_facts": [
    { "label": "стилизованный label", "value": "стилизованный value" }
  ],
  "critical_deadline": {
    "what_to_do": "стилизованное what_to_do",
    "consequence_of_missing": "стилизованное consequence_of_missing"
  },
  "verify_in_original": ["стилизованный пункт 1", "..."],
  "need_lawyer_reasons": ["стилизованный пункт 1", "..."]
}

ЕСЛИ critical_deadline на входе null — на выходе тоже null.

Никакого markdown, никакого текста до или после JSON.`;

interface StylizeInput {
  style: Exclude<Style, "normal">;
  analysis: AnalysisOutput;
  navigator: NavigatorOutput | null;
}

function userMessage(input: StylizeInput): string {
  const a = input.analysis;
  const payload = {
    headline: a.mood?.headline ?? "",
    summary: a.essence ?? "",
    title: a.title ?? "",
    navigator_summary: input.navigator?.short_summary ?? "",
    what_sender_wants: a.what_sender_wants ?? "",
    steps: a.what_to_do_now.map((s) => ({
      step: s.step ?? "",
      detail: s.detail ?? "",
    })),
    important_aspects: a.important_aspects,
    pitfalls: a.pitfalls.map((p) => ({
      title: p.title ?? "",
      explanation: p.explanation ?? "",
    })),
    case_complexity_explanation: a.case_complexity?.explanation ?? "",
    key_facts: a.key_facts.map((f) => ({
      label: f.label ?? "",
      value: f.value ?? "",
    })),
    critical_deadline: a.critical_deadline
      ? {
          what_to_do: a.critical_deadline.what_to_do ?? "",
          consequence_of_missing: a.critical_deadline.consequence_of_missing ?? "",
        }
      : null,
    verify_in_original: a.verify_in_original,
    need_lawyer_reasons: a.need_lawyer?.reasons ?? [],
  };
  return `=== ИНСТРУКЦИЯ ПО СТИЛЮ ===
${STYLE_INSTRUCTIONS[input.style]}

style = "${input.style}"

=== ИСХОДНЫЕ БЛОКИ (обычный стиль) ===
${JSON.stringify(payload, null, 2)}

Перепиши все эти блоки в указанном стиле:
- headline, summary, what_sender_wants, case_complexity_explanation — обычные строки;
- steps, important_aspects, pitfalls, key_facts, verify_in_original, need_lawyer_reasons —
  массивы строго той же длины и того же порядка; каждый элемент стилизуется индивидуально;
- key_facts: label и value стилизуются оба, но цифры/даты/статьи/реквизиты в value
  переноси ДОСЛОВНО — переписывай только обрамляющий текст;
- critical_deadline: если на входе null — на выходе null. Иначе стилизуй what_to_do и
  consequence_of_missing, не выдумывая новых дат и сумм.

Сохрани все цифры, даты, статьи, названия органов и токены маскирования.
Верни строго JSON по схеме StylizedOutput.`;
}

export async function stylize(
  provider: LLMProvider,
  analysis: AnalysisOutput,
  style: Style,
  navigator: NavigatorOutput | null = null,
): Promise<StylizedOutput | null> {
  if (style === "normal") return null;
  // Запускаем стилизацию, если есть хоть какой-то текстовый блок для переписывания.
  const hasAny =
    !!analysis.mood?.headline?.trim() ||
    !!analysis.essence?.trim() ||
    !!analysis.what_sender_wants?.trim() ||
    analysis.what_to_do_now.length > 0 ||
    analysis.important_aspects.length > 0 ||
    analysis.pitfalls.length > 0 ||
    !!analysis.case_complexity?.explanation?.trim() ||
    !!navigator?.short_summary?.trim();
  if (!hasAny) return null;

  const result = await provider.complete({
    system: SYSTEM_BASE,
    messages: [
      { role: "user", content: userMessage({ style, analysis, navigator }) },
    ],
    schema: StylizedOutputSchema,
    schemaName: "StylizedOutput",
    temperature: 0.8,
  });
  return { ...result.data, style };
}
