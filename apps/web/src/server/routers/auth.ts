import argon2 from "argon2";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LoginInput, RegisterInput, TokenPair } from "@pravoletter/schemas";
import { PrismaClient } from "@pravoletter/db";
import { router, publicProcedure } from "../trpc";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../../lib/jwt";
import { env } from "../../lib/env";

async function issueTokens(db: InstanceType<typeof PrismaClient>, userId: string, role: "user" | "admin", ip: string | null, ua: string | null) {
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
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email уже занят" });
      const passwordHash = await argon2.hash(input.password);
      const user = await ctx.db.user.create({
        data: { email: input.email, passwordHash },
      });
      // Сразу фиксируем согласие на обработку ПД (в UI чекбокс обязателен перед submit)
      await ctx.db.consent.create({
        data: { userId: user.id, kind: "pd_processing", version: "v1", ip: ctx.ip ?? undefined },
      });
      await ctx.db.consent.create({
        data: { userId: user.id, kind: "offer", version: "v1", ip: ctx.ip ?? undefined },
      });
      return issueTokens(ctx.db, user.id, user.role, ctx.ip, ctx.userAgent);
    }),

  login: publicProcedure
    .input(LoginInput)
    .output(TokenPair)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (!user || !user.passwordHash) {
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
      const record = await ctx.db.refreshToken.findUnique({ where: { tokenHash: hash } });
      if (!record || record.revokedAt || record.expiresAt < new Date()) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      // Ротация: выпускаем новые, старый отзываем
      await ctx.db.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      const user = await ctx.db.user.findUnique({ where: { id: record.userId } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return issueTokens(ctx.db, user.id, user.role, ctx.ip, ctx.userAgent);
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
