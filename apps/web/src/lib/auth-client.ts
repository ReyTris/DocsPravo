/**
 * Хранилище access/refresh токенов на клиенте + автоматический рефреш.
 *
 * MVP-вариант: localStorage. Минусы — уязвим к XSS.
 * Для прода переехать на httpOnly cookie + memory-only access token.
 *
 * Сессия живёт пока валиден refresh-токен (30 дней). Access-токен (15 мин)
 * прозрачно обновляется через `getValidAccessToken()` — её зовёт tRPC-клиент
 * перед каждым запросом, а защищённые страницы используют `hasSession()`,
 * чтобы не выкидывать пользователя на /login при истечении access.
 */

"use client";

const ACCESS_KEY = "pl.access";
const REFRESH_KEY = "pl.refresh";
const EXPIRES_KEY = "pl.expires";

// За сколько секунд до истечения access-токена считаем его уже невалидным
// и принудительно рефрешим. Защищает от race с серверной проверкой `exp`.
const ACCESS_SKEW_SEC = 30;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function saveTokens(t: StoredTokens) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, t.accessToken);
  localStorage.setItem(REFRESH_KEY, t.refreshToken);
  localStorage.setItem(EXPIRES_KEY, String(t.expiresAt));
  window.dispatchEvent(new Event("auth-changed"));
}

export function loadTokens(): StoredTokens | null {
  if (typeof window === "undefined") return null;
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) ?? 0);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, expiresAt };
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  window.dispatchEvent(new Event("auth-changed"));
}

/**
 * Синхронно: есть ли у пользователя локальный refresh-токен.
 * Используется как guard на страницах вместо проверки access-expiry —
 * иначе UX выкидывает на /login каждые 15 минут.
 *
 * Если refresh окажется невалидным на сервере, `getValidAccessToken()`
 * сбросит токены и сгенерит auth-changed; страницы среагируют через
 * наблюдение за событием.
 */
export function hasSession(): boolean {
  return loadTokens() !== null;
}

function isAccessFresh(t: StoredTokens): boolean {
  return t.expiresAt * 1000 - ACCESS_SKEW_SEC * 1000 > Date.now();
}

// Дедупликация параллельных рефрешей: одновременно идущие запросы должны
// получить один и тот же новый access-токен.
let inflightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  // tRPC HTTP-протокол (non-batched, superjson): POST /api/trpc/<route>
  // body { json: <input> }, response { result: { data: { json: <output> } } }
  try {
    const res = await fetch("/api/trpc/auth.refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { refreshToken } }),
    });
    if (!res.ok) {
      // 401/403 — refresh-токен отозван или истёк. Сбрасываем сессию.
      if (res.status === 401 || res.status === 403) {
        clearTokens();
      }
      return null;
    }
    const body = (await res.json()) as {
      result?: { data?: { json?: { accessToken: string; refreshToken: string; expiresAt: number } } };
    };
    const data = body.result?.data?.json;
    if (!data?.accessToken || !data.refreshToken || !data.expiresAt) {
      return null;
    }
    saveTokens(data);
    return data.accessToken;
  } catch {
    // Сеть упала — не сбрасываем сессию, дадим попробовать ещё раз позже.
    return null;
  }
}

/**
 * Возвращает свежий access-токен, при необходимости рефрешит.
 * `null` означает «сессия закончилась» — вызывающий должен редиректить на /login.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const t = loadTokens();
  if (!t) return null;
  if (isAccessFresh(t)) return t.accessToken;

  if (!inflightRefresh) {
    inflightRefresh = refreshAccessToken(t.refreshToken).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}
