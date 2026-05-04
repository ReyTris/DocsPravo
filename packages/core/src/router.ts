/**
 * Маршрутизатор: на основе результата navigator-а решает, по какой ветке пускать документ.
 *
 *   green — полный специализированный разбор (как раньше для ФНС)
 *   yellow — безопасный пересказ + чек-лист + редирект к юристу как опция
 *   red — НЕ разбираем, экран "к юристу обязательно"
 */

import type {
  NavigatorOutput,
  Tier,
  SenderCategory,
  Urgency,
} from "@pravoletter/schemas";

const GREEN_DOC_KINDS = new Set([
  "trebovanie_fns",
  "uvedomlenie_fns",
  "trebovanie_poyasneniy",
  // По мере расширения сюда добавляются проверенные специализированные промты
]);

const RED_DOC_KINDS = new Set([
  "sudebnyy_prikaz",
  "povestka_voenkomat",
  "ugolovnoe",
]);

const RED_SENDER_CATEGORIES = new Set<SenderCategory>([
  "court",
  "voenkomat",
  "police",
]);

export interface RouteDecision {
  tier: Tier;
  reason: string;
}

export function route(nav: NavigatorOutput): RouteDecision {
  // RED: жёстко не разбираем — суд, военкомат, любая уголовка.
  if (RED_DOC_KINDS.has(nav.document_kind_normalized)) {
    return {
      tier: "red",
      reason: `Тип документа "${nav.document_kind_normalized}" в списке исключений: судебные, военкомат, уголовные дела не разбираем автоматически.`,
    };
  }
  if (RED_SENDER_CATEGORIES.has(nav.sender_category)) {
    return {
      tier: "red",
      reason: `Отправитель "${nav.sender_category}" — суд, силовые органы или военкомат. Автоматический разбор не делаем.`,
    };
  }
  if (nav.urgency === "critical") {
    return {
      tier: "red",
      reason: "Критическая срочность по navigator-у — нужен юрист, а не AI.",
    };
  }

  // GREEN: только если документ из явно поддерживаемого списка типов
  if (GREEN_DOC_KINDS.has(nav.document_kind_normalized)) {
    return {
      tier: "green",
      reason: `Тип "${nav.document_kind_normalized}" в зелёном списке — делаем полный специализированный разбор.`,
    };
  }

  // YELLOW: всё остальное безопасно пересказываем
  return {
    tier: "yellow",
    reason:
      "Документ не входит в зелёный список типов с проверенным специализированным разбором. Делаем безопасный пересказ.",
  };
}

export const TIER_PRICES_KOPECKS: Record<Tier, number> = {
  green: 59000,  // 590 ₽ полный разбор
  yellow: 29000, // 290 ₽ безопасный пересказ
  red: 0,        // не продаём, бесплатный экран "к юристу"
};
