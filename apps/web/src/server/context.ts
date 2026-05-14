/**
 * Контекст tRPC. Создаётся на каждый запрос.
 * Содержит: db, текущий user (если авторизован), client info,
 * cookie с refresh-токеном, а также мутируемые resHeaders —
 * через них процедуры выставляют Set-Cookie.
 *
 * Авторизация:
 *  - access-токен — Bearer в заголовке Authorization (одинаково для web и mobile);
 *  - refresh-токен — httpOnly cookie `pd_rt` (только web).
 *
 * Один и тот же контракт обслуживает обе платформы: на mobile cookie не ставится,
 * мутации auth.refresh/auth.logout получают токен из тела запроса (если когда-нибудь
 * понадобится — добавим явный input, сейчас на mobile ходить ещё нечем).
 */

import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { prisma } from "@prodoki/db";
import { verifyAccessToken } from "../lib/jwt";
import { REFRESH_COOKIE_NAME, readCookie } from "../lib/auth-cookie";

export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  const authHeader = req.headers.get("authorization");
  let user: { id: string; role: "user" | "admin" } | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const payload = await verifyAccessToken(token);
    if (payload) {
      user = { id: payload.sub, role: payload.role };
    }
  }

  const refreshTokenFromCookie = readCookie(req.headers.get("cookie"), REFRESH_COOKIE_NAME);

  return {
    db: prisma,
    user,
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
    refreshTokenFromCookie,
    // fetchRequestHandler автоматически вмерджит эти заголовки в финальный Response.
    // Мутации auth.* пушат сюда Set-Cookie через `appendSetCookie`.
    resHeaders,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
