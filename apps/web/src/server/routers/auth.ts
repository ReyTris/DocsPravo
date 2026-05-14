import argon2 from "argon2";
import { TRPCError } from "@trpc/server";
import { AccessTokenResponse, LoginInput, RegisterInput } from "@prodoki/schemas";
import { PrismaClient } from "@prodoki/db";
import { router, publicProcedure } from "../trpc";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../../lib/jwt";
import { env } from "../../lib/env";
import { grantSignupBonus } from "../services/pages";
import {
  buildClearRefreshCookie,
  buildSetRefreshCookie,
} from "../../lib/auth-cookie";

// OWASP-рекомендации argon2id (2024+). Фиксируем явно, чтобы апдейт библиотеки
// не менял стоимость хеша незаметно.
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isSecureCookieEnv(): boolean {
  return env().NODE_ENV === "production";
}

async function issueTokens(
  db: InstanceType<typeof PrismaClient>,
  resHeaders: Headers,
  userId: string,
  role: "user" | "admin",
  ip: string | null,
  ua: string | null,
) {
  const access = await signAccessToken({ sub: userId, role });
  const refresh = generateRefreshToken();
  const refreshTtlSec = env().JWT_REFRESH_TTL_SEC;
  const expiresAt = new Date(Date.now() + refreshTtlSec * 1000);
  await db.refreshToken.create({
    data: { userId, tokenHash: refresh.hash, expiresAt, ip, userAgent: ua },
  });
  // Refresh-токен уезжает в httpOnly cookie — клиент его не увидит и не сможет
  // выдрать через XSS. Множественный append корректен: Set-Cookie допускает
  // несколько заголовков в одном ответе (например, при ротации).
  resHeaders.append(
    "Set-Cookie",
    buildSetRefreshCookie(refresh.plain, {
      maxAgeSec: refreshTtlSec,
      secure: isSecureCookieEnv(),
    }),
  );
  return {
    accessToken: access.token,
    expiresAt: access.expiresAt,
  };
}

function clearRefreshCookie(resHeaders: Headers) {
  resHeaders.append(
    "Set-Cookie",
    buildClearRefreshCookie({ secure: isSecureCookieEnv() }),
  );
}

export const authRouter = router({
  register: publicProcedure
    .input(RegisterInput)
    .output(AccessTokenResponse)
    .mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const existing = await ctx.db.user.findUnique({ where: { email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email уже занят" });
      const passwordHash = await argon2.hash(input.password, ARGON2_OPTS);
      const user = await ctx.db.user.create({
        data: { email, passwordHash },
      });
      // Сразу фиксируем согласие на обработку ПД (в UI чекбокс обязателен перед submit)
      await ctx.db.consent.create({
        data: { userId: user.id, kind: "pd_processing", version: "v1", ip: ctx.ip ?? undefined },
      });
      await ctx.db.consent.create({
        data: { userId: user.id, kind: "offer", version: "v1", ip: ctx.ip ?? undefined },
      });
      // Приветственный бонус — 1 страница для пробного разбора. Идемпотентно по userId,
      // так что повторный вызов (например, при ретрае мутации) не задвоит.
      await grantSignupBonus(ctx.db, user.id);
      return issueTokens(ctx.db, ctx.resHeaders, user.id, user.role, ctx.ip, ctx.userAgent);
    }),

  login: publicProcedure
    .input(LoginInput)
    .output(AccessTokenResponse)
    .mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      const user = await ctx.db.user.findUnique({ where: { email } });
      // Постоянное время ответа: всегда verify против чего-то, чтобы не утечь по таймингу
      // факт существования пользователя.
      const dummyHash =
        "$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0ZGVmYXVsdA$1m9z3X6yKYf9o0v4yqQz3gK0GZ5C8e3F0Fz3gK0GZ5C";
      if (!user || !user.passwordHash || user.deletedAt) {
        await argon2.verify(dummyHash, input.password).catch(() => false);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный email или пароль" });
      }
      const ok = await argon2.verify(user.passwordHash, input.password);
      if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный email или пароль" });
      return issueTokens(ctx.db, ctx.resHeaders, user.id, user.role, ctx.ip, ctx.userAgent);
    }),

  /**
   * Обновление access-токена. Refresh читается из httpOnly cookie `pd_rt`,
   * никаких токенов в body — это и убирает XSS-вектор, и упрощает клиента.
   */
  refresh: publicProcedure
    .output(AccessTokenResponse)
    .mutation(async ({ ctx }) => {
      const refreshToken = ctx.refreshTokenFromCookie;
      if (!refreshToken) {
        // Cookie нет — для клиента это сигнал «сессии нет, веди на /login».
        // Старую (возможно битую) куку всё же затрём, чтобы не зацикливать рефреш.
        clearRefreshCookie(ctx.resHeaders);
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const hash = hashRefreshToken(refreshToken);
      // Ротация и выпуск — внутри одной транзакции, чтобы избежать состояния,
      // когда старый отозван, а новый не записан.
      try {
        return await ctx.db.$transaction(async (tx) => {
          const record = await tx.refreshToken.findUnique({ where: { tokenHash: hash } });
          if (!record || record.revokedAt || record.expiresAt < new Date()) {
            throw new TRPCError({ code: "UNAUTHORIZED" });
          }
          // Атомарный revoke: если кто-то параллельно уже отозвал — updateMany вернёт 0.
          const revoked = await tx.refreshToken.updateMany({
            where: { id: record.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          if (revoked.count === 0) {
            // Параллельный refresh с тем же токеном — потенциальная replay-атака.
            // Отзываем все активные токены пользователя для безопасности.
            await tx.refreshToken.updateMany({
              where: { userId: record.userId, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Token reuse detected" });
          }
          const user = await tx.user.findUnique({ where: { id: record.userId } });
          if (!user || user.deletedAt) throw new TRPCError({ code: "UNAUTHORIZED" });
          return issueTokens(
            tx as unknown as InstanceType<typeof PrismaClient>,
            ctx.resHeaders,
            user.id,
            user.role,
            ctx.ip,
            ctx.userAgent,
          );
        });
      } catch (err) {
        // Любой провал refresh означает, что текущая cookie бесполезна —
        // снимаем её, чтобы фронт не пытался рефрешить в цикле.
        if (err instanceof TRPCError && err.code === "UNAUTHORIZED") {
          clearRefreshCookie(ctx.resHeaders);
        }
        throw err;
      }
    }),

  /**
   * Logout. Токен берём из cookie; даже если её нет — куку всё равно
   * выставим на удаление, чтобы вызов был идемпотентным.
   */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const refreshToken = ctx.refreshTokenFromCookie;
    if (refreshToken) {
      const hash = hashRefreshToken(refreshToken);
      await ctx.db.refreshToken.updateMany({
        where: { tokenHash: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(ctx.resHeaders);
    return { ok: true as const };
  }),
});
