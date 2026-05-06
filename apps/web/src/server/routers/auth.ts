import argon2 from "argon2";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LoginInput, RegisterInput, TokenPair } from "@pravoletter/schemas";
import { PrismaClient } from "@pravoletter/db";
import { router, publicProcedure } from "../trpc";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../../lib/jwt";
import { env } from "../../lib/env";
import { grantSignupBonus } from "../services/pages";

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

async function issueTokens(
  db: InstanceType<typeof PrismaClient>,
  userId: string,
  role: "user" | "admin",
  ip: string | null,
  ua: string | null,
) {
  const access = await signAccessToken({ sub: userId, role });
  const refresh = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env().JWT_REFRESH_TTL_SEC * 1000);
  await db.refreshToken.create({
    data: { userId, tokenHash: refresh.hash, expiresAt, ip, userAgent: ua },
  });
  return {
    accessToken: access.token,
    refreshToken: refresh.plain,
    expiresAt: access.expiresAt,
  };
}

export const authRouter = router({
  register: publicProcedure
    .input(RegisterInput)
    .output(TokenPair)
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
      return issueTokens(ctx.db, user.id, user.role, ctx.ip, ctx.userAgent);
    }),

  login: publicProcedure
    .input(LoginInput)
    .output(TokenPair)
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
      return issueTokens(ctx.db, user.id, user.role, ctx.ip, ctx.userAgent);
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .output(TokenPair)
    .mutation(async ({ ctx, input }) => {
      const hash = hashRefreshToken(input.refreshToken);
      // Ротация и выпуск — внутри одной транзакции, чтобы избежать состояния,
      // когда старый отозван, а новый не записан.
      return ctx.db.$transaction(async (tx) => {
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
        return issueTokens(tx as unknown as InstanceType<typeof PrismaClient>, user.id, user.role, ctx.ip, ctx.userAgent);
      });
    }),

  logout: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hash = hashRefreshToken(input.refreshToken);
      await ctx.db.refreshToken.updateMany({
        where: { tokenHash: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { ok: true as const };
    }),
});
