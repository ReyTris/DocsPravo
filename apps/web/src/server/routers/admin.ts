import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prodoki/db";
import { router, adminProcedure } from "../trpc";

export const adminRouter = router({
  // ─── Dashboard stats ───────────────────────────────────────────────────────
  stats: adminProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersToday,
      newUsersWeek,
      totalDocuments,
      docsToday,
      docsProcessing,
      totalPayments,
      revenueTotal,
      revenueMonth,
      paymentsToday,
    ] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { createdAt: { gte: dayAgo }, deletedAt: null } }),
      db.user.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
      db.document.count(),
      db.document.count({ where: { createdAt: { gte: dayAgo } } }),
      db.document.count({
        where: {
          status: {
            in: [
              "uploaded",
              "ocr_processing",
              "classify_processing",
              "extract_processing",
              "analyze_processing",
            ],
          },
        },
      }),
      db.payment.count({ where: { status: "succeeded" } }),
      db.payment.aggregate({
        where: { status: "succeeded" },
        _sum: { amountKopecks: true },
      }),
      db.payment.aggregate({
        where: { status: "succeeded", paidAt: { gte: monthAgo } },
        _sum: { amountKopecks: true },
      }),
      db.payment.count({
        where: { status: "succeeded", paidAt: { gte: dayAgo } },
      }),
    ]);

    return {
      users: { total: totalUsers, today: newUsersToday, week: newUsersWeek },
      documents: { total: totalDocuments, today: docsToday, processing: docsProcessing },
      payments: {
        total: totalPayments,
        today: paymentsToday,
        revenueKopecks: revenueTotal._sum.amountKopecks ?? 0,
        revenueMonthKopecks: revenueMonth._sum.amountKopecks ?? 0,
      },
    };
  }),

  // ─── Users ─────────────────────────────────────────────────────────────────
  users: router({
    list: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        }),
      )
      .query(async ({ ctx, input }) => {
        const items = await ctx.db.user.findMany({
          where: {
            deletedAt: null,
            ...(input.search
              ? { email: { contains: input.search, mode: "insensitive" } }
              : {}),
            ...(input.cursor ? { id: { lt: input.cursor } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: input.limit + 1,
          select: {
            id: true,
            email: true,
            role: true,
            balancePages: true,
            createdAt: true,
            _count: { select: { documents: true, payments: true } },
          },
        });

        let nextCursor: string | undefined;
        if (items.length > input.limit) {
          nextCursor = items[input.limit - 1]?.id;
          items.pop();
        }

        return { items, nextCursor };
      }),

    getById: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const user = await ctx.db.user.findUnique({
          where: { id: input.id },
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            balancePages: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            documents: {
              orderBy: { createdAt: "desc" },
              take: 10,
              select: {
                id: true,
                filename: true,
                status: true,
                createdAt: true,
                pagesCharged: true,
              },
            },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 10,
              select: {
                id: true,
                amountKopecks: true,
                product: true,
                status: true,
                pagesGranted: true,
                createdAt: true,
                paidAt: true,
              },
            },
            pageTransactions: {
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                delta: true,
                reason: true,
                balanceAfter: true,
                note: true,
                createdAt: true,
              },
            },
          },
        });

        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        return user;
      }),

    adjustQuota: adminProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          delta: z.number().int().refine((v) => v !== 0, "delta не может быть 0"),
          note: z.string().min(1).max(255),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const user = await ctx.db.user.findUnique({
          where: { id: input.userId },
          select: { balancePages: true },
        });
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });

        const newBalance = user.balancePages + input.delta;
        if (newBalance < 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Баланс уйдёт в минус (${newBalance}). Уменьшите delta.`,
          });
        }

        await ctx.db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: input.userId },
            data: { balancePages: newBalance },
          });
          await tx.pageTransaction.create({
            data: {
              userId: input.userId,
              delta: input.delta,
              reason: "adjustment",
              balanceAfter: newBalance,
              note: `[Admin] ${input.note}`,
            },
          });
        });

        return { newBalance };
      }),
  }),

  // ─── Payments ──────────────────────────────────────────────────────────────
  payments: router({
    list: adminProcedure
      .input(
        z.object({
          status: z.enum(["pending", "succeeded", "canceled", "refunded"]).optional(),
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        }),
      )
      .query(async ({ ctx, input }) => {
        const items = await ctx.db.payment.findMany({
          where: {
            ...(input.status ? { status: input.status } : {}),
            ...(input.cursor ? { id: { lt: input.cursor } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: input.limit + 1,
          select: {
            id: true,
            amountKopecks: true,
            product: true,
            status: true,
            pagesGranted: true,
            ukassaId: true,
            createdAt: true,
            paidAt: true,
            user: { select: { id: true, email: true } },
          },
        });

        let nextCursor: string | undefined;
        if (items.length > input.limit) {
          nextCursor = items[input.limit - 1]?.id;
          items.pop();
        }

        return { items, nextCursor };
      }),
  }),

  // ─── Documents ─────────────────────────────────────────────────────────────
  documents: router({
    list: adminProcedure
      .input(
        z.object({
          status: z.string().optional(),
          userId: z.string().uuid().optional(),
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        }),
      )
      .query(async ({ ctx, input }) => {
        const items = await ctx.db.document.findMany({
          where: {
            ...(input.status ? { status: input.status } : {}),
            ...(input.userId ? { userId: input.userId } : {}),
            ...(input.cursor ? { id: { lt: input.cursor } } : {}),
          } as Prisma.DocumentWhereInput,
          orderBy: { createdAt: "desc" },
          take: input.limit + 1,
          select: {
            id: true,
            filename: true,
            status: true,
            tier: true,
            detectedType: true,
            essence: true,
            pagesCharged: true,
            createdAt: true,
            user: { select: { id: true, email: true } },
          },
        });

        let nextCursor: string | undefined;
        if (items.length > input.limit) {
          nextCursor = items[input.limit - 1]?.id;
          items.pop();
        }

        return { items, nextCursor };
      }),
  }),
});
