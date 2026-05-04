/**
 * Контекст tRPC. Создаётся на каждый запрос.
 * Содержит: db, текущий user (если авторизован), client info.
 *
 * Авторизация — Bearer-токен в заголовке Authorization.
 * Этот же контракт используется и веб-клиентом, и (в будущем) мобильным.
 */

import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { prisma } from "@pravoletter/db";
import { verifyAccessToken } from "../lib/jwt.js";

export async function createContext({ req }: FetchCreateContextFnOptions) {
  const authHeader = req.headers.get("authorization");
  let user: { id: string; role: "user" | "admin" } | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const payload = await verifyAccessToken(token);
    if (payload) {
      user = { id: payload.sub, role: payload.role };
    }
  }

  return {
    db: prisma,
    user,
    ip: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
