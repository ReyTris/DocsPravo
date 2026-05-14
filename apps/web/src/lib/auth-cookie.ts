/**
 * Refresh-токен живёт в httpOnly cookie, недоступной JS.
 *
 * Безопасность:
 *  - HttpOnly        — токен невозможно прочитать через XSS (document.cookie).
 *  - Secure          — отправляется только по HTTPS (в dev без TLS флаг отключён).
 *  - SameSite=Lax    — браузер не отправляет cookie на cross-site POST,
 *                      что блокирует CSRF на /api/trpc/auth.refresh. Lax (а не Strict)
 *                      нужен, чтобы cookie ехала при переходах по ссылкам
 *                      из писем/внешних сайтов и сессия не «терялась» после клика.
 *  - Path=/          — нужна и на /api/trpc/auth.refresh, и на возможных
 *                      Server Actions/Route Handlers.
 *  - Max-Age         — равен TTL refresh-токена в БД, чтобы UX и серверная истина
 *                      совпадали (после Max-Age браузер выкинет cookie сам).
 *
 *  Access-токен в cookie НЕ кладём: его носит Authorization-заголовок,
 *  поэтому CSRF на защищённые мутации невозможен в принципе.
 */

export const REFRESH_COOKIE_NAME = "pd_rt";

interface BuildCookieOptions {
  /** ttl в секундах. Должен совпадать с тем, под который выписан токен. */
  maxAgeSec: number;
  /** В dev (http) Secure отключаем, иначе браузер откажется ставить cookie. */
  secure: boolean;
}

export function buildSetRefreshCookie(token: string, opts: BuildCookieOptions): string {
  return serializeCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: "Lax",
    path: "/",
    maxAgeSec: opts.maxAgeSec,
  });
}

export function buildClearRefreshCookie(opts: { secure: boolean }): string {
  // Max-Age=0 + пустое значение — стандартный способ попросить браузер
  // немедленно удалить cookie. Path обязан совпадать с тем, что использовался
  // при установке, иначе браузер удалит «другую» cookie с тем же именем.
  return serializeCookie(REFRESH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: opts.secure,
    sameSite: "Lax",
    path: "/",
    maxAgeSec: 0,
  });
}

/**
 * Парсит значение cookie из заголовка `Cookie`. Возвращает null,
 * если cookie с указанным именем нет или он пустой.
 */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  // Заголовок Cookie — это набор `name=value` через `; `. Значения уже
  // url-decoded браузером не считаются, но мы кладём только hex-строку,
  // так что decodeURIComponent безопасен и не сломает данные.
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const raw = part.slice(idx + 1).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

interface SerializeOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
  path: string;
  maxAgeSec: number;
}

function serializeCookie(name: string, value: string, opts: SerializeOptions): string {
  const encoded = encodeURIComponent(value);
  const parts = [`${name}=${encoded}`, `Path=${opts.path}`, `Max-Age=${opts.maxAgeSec}`, `SameSite=${opts.sameSite}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
