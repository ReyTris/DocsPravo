/**
 * Маршрутизатор. Возвращает tier — метку уровня риска документа.
 * Tier теперь НЕ блокирует pipeline (red-документы тоже разбираются),
 * а используется UI для усиления предупреждений и audit-логов.
 *
 *   green  — тип в зелёном списке (специализированный промт точен).
 *   yellow — обычный документ вне зелёного списка.
 *   red    — повышенный риск: суды, военкомат, уголовка. UI должен показать
 *            расширенные предупреждения и заставить пользователя подтвердить
 *            понимание перед открытием разбора.
 */

import type {
  NavigatorOutput,
  Tier,
  SenderCategory,
} from "@prodoki/schemas";

const GREEN_DOC_KINDS = new Set([
  "trebovanie_fns",
  "uvedomlenie_fns",
  "trebovanie_poyasneniy",
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
  // RED: высокий риск — но pipeline всё равно работает.
  if (RED_DOC_KINDS.has(nav.document_kind_normalized)) {
    return {
      tier: "red",
      reason: `Тип "${nav.document_kind_normalized}" — высокий риск. Разбор делаем, но требуем подтверждение пользователя и направляем к юристу.`,
    };
  }
  if (RED_SENDER_CATEGORIES.has(nav.sender_category)) {
    return {
      tier: "red",
      reason: `Отправитель "${nav.sender_category}" — суд/военкомат/силовые. Разбор делаем, но с расширенными предупреждениями.`,
    };
  }
  if (nav.urgency === "critical") {
    return {
      tier: "red",
      reason: "Критическая срочность по navigator — повышенный риск.",
    };
  }

  // GREEN: тип из явно поддерживаемого списка
  if (GREEN_DOC_KINDS.has(nav.document_kind_normalized)) {
    return {
      tier: "green",
      reason: `Тип "${nav.document_kind_normalized}" в зелёном списке — точный специализированный разбор.`,
    };
  }

  // YELLOW: всё остальное
  return {
    tier: "yellow",
    reason: "Документ вне зелёного списка — даём универсальный разбор.",
  };
}

export const TIER_PRICES_KOPECKS: Record<Tier, number> = {
  green: 59000,
  yellow: 29000,
  red: 59000, // полный разбор для red-документов также по тарифу 590 ₽
};
