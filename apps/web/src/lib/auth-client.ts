/**
 * Клиентское состояние авторизации.
 *
 * Дизайн:
 *  - Refresh-токен лежит в httpOnly cookie (`pd_rt`) — JS его не видит.
 *  - Access-токен (15 мин) живёт ТОЛЬКО в памяти этого модуля.
 *    Никакого localStorage: страница перезагрузилась — токена нет;
 *    `getValidAccessToken()` дёрнет `auth.refresh`, и сервер по cookie
 *    выдаст свежий access. Это закрывает XSS-вектор, при котором
 *    злоумышленник читает токены из localStorage.
 *  - Состояние сессии (`unknown` / `authenticated` / `unauthenticated`)
 *    держим явно, чтобы:
 *      a) на первом рендере не «моргать» гостевым UI до окончания рефреша;
 *      b) не бомбить `auth.refresh` повторно, если первая попытка вернула 401.
 *
 * События:
 *  - `auth-changed` — устаревший сигнал для обратной совместимости; шлётся
 *    при любых переходах состояния, чтобы Header/PricingSection могли
 *    пересинхрониться без хука (там, где хук неудобен).
 */

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const ACCESS_SKEW_SEC = 30;

export type SessionStatus = "unknown" | "authenticated" | "unauthenticated";

interface AccessState {
  accessToken: string;
  expiresAt: number; // unix-секунды, как в JWT exp
}

let accessState: AccessState | null = null;
let sessionStatus: SessionStatus = "unknown";
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-changed"));
  }
}

export function setAccess(value: AccessState) {
  accessState = value;
  sessionStatus = "authenticated";
  notify();
}

export function clearAccess() {
  accessState = null;
  sessionStatus = "unauthenticated";
  notify();
}

function setUnknown() {
  accessState = null;
  sessionStatus = "unknown";
  notify();
}

function isFresh(state: AccessState): boolean {
  return state.expiresAt * 1000 - ACCESS_SKEW_SEC * 1000 > Date.now();
}

// Дедуп параллельных рефрешей: один in-flight запрос на все вызовы.
let inflightRefresh: Promise<string | null> | null = null;

async function callRefresh(): Promise<string | null> {
  // tRPC HTTP (non-batched, superjson): POST /api/trpc/<route>
  // body { json: <input> }, response { result: { data: { json: <output> } } }.
  // У refresh нет инпута, но tRPC всё равно ожидает корректный body.
  try {
    const res = await fetch("/api/trpc/auth.refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // credentials: "same-origin" — дефолт, cookie уедут автоматически.
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      // 401 — refresh-cookie протухла или отозвана; сервер уже выставил
      // Set-Cookie с Max-Age=0, мы лишь синхронизируем in-memory состояние.
      if (res.status === 401 || res.status === 403) {
        clearAccess();
      }
      return null;
    }
    const body = (await res.json()) as {
      result?: { data?: { json?: { accessToken: string; expiresAt: number } } };
    };
    const data = body.result?.data?.json;
    if (!data?.accessToken || !data.expiresAt) {
      clearAccess();
      return null;
    }
    setAccess(data);
    return data.accessToken;
  } catch {
    // Сетевой сбой — состояние не меняем, дадим попробовать ещё раз позже.
    return null;
  }
}

/**
 * Возвращает свежий access-токен. При истечении/отсутствии — пытается рефрешить
 * через cookie. Возвращает null, если сессии нет (вызывающий обязан редиректить).
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (accessState && isFresh(accessState)) return accessState.accessToken;

  // Если мы уже точно знаем, что сессии нет — не дёргаем сервер.
  // Это предотвращает шторм рефрешей на публичных страницах.
  if (sessionStatus === "unauthenticated") return null;

  if (!inflightRefresh) {
    inflightRefresh = callRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/**
 * Подписка на изменения состояния сессии для React-хуков
 * (через useSyncExternalStore).
 */
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getStatusSnapshot(): SessionStatus {
  return sessionStatus;
}

function getServerSnapshot(): SessionStatus {
  // На сервере состояние нам неизвестно — показываем «загрузку».
  // Хук всё равно отработает на клиенте после mount.
  return "unknown";
}

/**
 * Хук состояния сессии. Триггерит однократный рефреш на маунте, если статус
 * ещё `unknown`. Возвращает один из трёх стабильных стейтов — UI рендерит
 * `loading` для `unknown`, чтобы не моргать гостевыми экранами.
 */
export function useSession(): SessionStatus {
  const status = useSyncExternalStore(subscribe, getStatusSnapshot, getServerSnapshot);
  useEffect(() => {
    if (sessionStatus === "unknown") {
      // Принудительная попытка восстановить сессию по cookie на первом рендере.
      void getValidAccessToken();
    }
  }, []);
  return status;
}

/**
 * Удобный хелпер: возвращает stable-флаги для рендера.
 * `isLoading` истинно, пока мы не сделали первую попытку рефреша.
 */
export function useAuthFlags(): {
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const status = useSession();
  return {
    isLoading: status === "unknown",
    isAuthenticated: status === "authenticated",
  };
}

/**
 * Отдельная функция выхода: дёргает серверный logout (он же снимет cookie),
 * затем чистит in-memory состояние. Используем именно так, потому что
 * клиент не может погасить httpOnly cookie сам.
 */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/trpc/auth.logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // Сетевой сбой не должен мешать локальному выходу — кука всё равно
    // протухнет по Max-Age. Главное — снять access из памяти.
  }
  clearAccess();
}

// React-only API экспонируется выше. Низкоуровневые сеттеры (`setAccess`,
// `clearAccess`) нужны странице login/register, чтобы зафиксировать
// успешный вход без отдельного рефреша.

/**
 * Сбрасывает статус в `unknown`. Используется только в тестах/при HMR
 * (например, чтобы пересоздать состояние при пересборке модуля).
 */
export function _resetAuthForTests() {
  setUnknown();
}
