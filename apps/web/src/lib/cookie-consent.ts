/**
 * Хранение согласия пользователя на использование cookie.
 *
 * Правовое основание: ч. 1 ст. 18.1 ФЗ-152 + разъяснения Роскомнадзора:
 * cookie, позволяющие идентифицировать пользователя (аналитика, маркетинг),
 * требуют согласия. Технически необходимые (сессия, аутентификация) —
 * устанавливаются без согласия как исполнение договора.
 *
 * Версионирование: при изменении категорий или правовых условий повышаем
 * CONSENT_VERSION — пользователь увидит баннер повторно.
 */

export const CONSENT_STORAGE_KEY = "cookie-consent";
export const CONSENT_VERSION = 1;
export const CONSENT_CHANGED_EVENT = "cookie-consent-changed";

export type CookieConsent = {
  version: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(input: {
  analytics: boolean;
  marketing: boolean;
}): CookieConsent {
  const value: CookieConsent = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: input.analytics,
    marketing: input.marketing,
    decidedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: value }));
  return value;
}
