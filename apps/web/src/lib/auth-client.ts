/**
 * Хранилище access/refresh токенов на клиенте.
 *
 * MVP-вариант: localStorage. Минусы — уязвим к XSS.
 * Для прода переехать на httpOnly cookie + memory-only access token.
 * Сейчас оставлено просто, чтобы не блокировать MVP.
 */

"use client";

const ACCESS_KEY = "pl.access";
const REFRESH_KEY = "pl.refresh";
const EXPIRES_KEY = "pl.expires";

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
  // Триггер для перерисовки компонентов, слушающих storage
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

export function getAccessToken(): string | null {
  return loadTokens()?.accessToken ?? null;
}

export function isAuthenticated(): boolean {
  const t = loadTokens();
  if (!t) return false;
  return t.expiresAt * 1000 > Date.now();
}
