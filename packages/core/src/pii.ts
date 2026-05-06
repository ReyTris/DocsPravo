/**
 * Маскирование персональных данных перед отправкой в LLM.
 *
 * Принципы:
 * - Маскируем regex-ом то, что хорошо ловится паттерном (ИНН, СНИЛС, паспорт, счета, УИН).
 * - ФИО и адреса regex-ом ловятся плохо — для прода их извлекаем отдельным шагом
 *   (например, нативным NER) и маскируем по словарю. В этом MVP-скрипте оставляем как есть,
 *   рассчитывая на синтетический датасет.
 * - Маппинг хранится только в памяти процесса. После генерации финального ответа
 *   делаем обратную подстановку.
 */

export interface PiiMap {
  // token -> original value
  forward: Map<string, string>;
}

interface Rule {
  name: string;
  // ВАЖНО: в LLM хочется одинаковый токен для повторов. Считаем счётчик внутри run-а.
  pattern: RegExp;
}

// ВАЖНО: порядок имеет значение — длинные/специфичные паттерны должны идти
// раньше коротких. Иначе короткий съест часть длинного (например, СЧЁТ-20 поглотит
// УИН-25).
const RULES: Rule[] = [
  // УИН — 25 цифр (платёжный документ); 20-значный УИН ловится паттерном СЧЁТ ниже,
  // что не критично для маскировки (число всё равно скрыто) и корректно восстановится.
  { name: "УИН", pattern: /\b\d{25}\b/g },
  // ОГРНИП — 15 цифр (раньше ОГРН-13 и СЧЁТ-20)
  { name: "ОГРНИП", pattern: /\b\d{15}\b/g },
  // ОГРН — 13 цифр (раньше ИНН-12)
  { name: "ОГРН", pattern: /\b\d{13}\b/g },
  // ИНН физлица (12 цифр) и юрлица (10 цифр)
  { name: "ИНН", pattern: /\b(\d{10}|\d{12})\b/g },
  // СНИЛС: 123-456-789 00 (с дефисами) или 11 подряд цифр после ключевого слова
  { name: "СНИЛС", pattern: /\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g },
  { name: "СНИЛС", pattern: /(?<=СНИЛС[:№\s]{1,5})\d{11}\b/gi },
  // Серия и номер паспорта: только с ключевым словом, иначе слишком много false-positives
  // (любые 4+6 цифр в тексте — например "счёт 1234 567890").
  {
    name: "ПАСПОРТ",
    pattern: /(?<=паспорт[\s№:]{0,5}|серия[\s№:]{0,5})\d{4}\s?\d{6}\b/gi,
  },
  // КПП: 9 цифр после ключевого слова
  { name: "КПП", pattern: /\bКПП\s*[:№]?\s*(\d{9})\b/gi },
  // Расчётный счёт: 20 цифр (после длинных уже отработали)
  { name: "СЧЁТ", pattern: /\b\d{20}\b/g },
  // Email
  { name: "EMAIL", pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  // Телефон РФ
  { name: "ТЕЛЕФОН", pattern: /(\+7|8)[\s\-(]?\d{3}[\s\-)]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g },
];

export function maskPii(text: string): { masked: string; map: PiiMap } {
  const forward = new Map<string, string>();
  const reverseLookup = new Map<string, string>(); // original -> token
  const counters = new Map<string, number>();

  let masked = text;
  for (const rule of RULES) {
    masked = masked.replace(rule.pattern, (match) => {
      const existing = reverseLookup.get(match);
      if (existing) return existing;
      const n = (counters.get(rule.name) ?? 0) + 1;
      counters.set(rule.name, n);
      const token = `[${rule.name}_${n}]`;
      forward.set(token, match);
      reverseLookup.set(match, token);
      return token;
    });
  }

  return { masked, map: { forward } };
}

export function unmaskPii(text: string, map: PiiMap): string {
  let out = text;
  for (const [token, original] of map.forward) {
    out = out.replaceAll(token, original);
  }
  return out;
}

/** Рекурсивно проходит по объекту и обратно подставляет ПД во всех строковых полях. */
export function unmaskDeep<T>(value: T, map: PiiMap): T {
  if (typeof value === "string") return unmaskPii(value, map) as T;
  if (Array.isArray(value)) return value.map((v) => unmaskDeep(v, map)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = unmaskDeep(v, map);
    }
    return out as T;
  }
  return value;
}
