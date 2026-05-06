import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getBalance, PAGE_PACKAGES, type PagePackageId } from "../services/pages";

export const pagesRouter = router({
  /** Текущий баланс страниц авторизованного пользователя. */
  balance: protectedProcedure
    .output(z.object({ balance: z.number().int().nonnegative() }))
    .query(async ({ ctx }) => {
      return { balance: await getBalance(ctx.db, ctx.user.id) };
    }),

  /** Список доступных пакетов для UI страницы покупки. */
  packages: protectedProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          pages: z.number().int().positive(),
          priceKopecks: z.number().int().positive(),
        }),
      ),
    )
    .query(async () => {
      return (Object.keys(PAGE_PACKAGES) as PagePackageId[]).map((id) => ({
        id,
        pages: PAGE_PACKAGES[id].pages,
        priceKopecks: PAGE_PACKAGES[id].priceKopecks,
      }));
    }),

  /**
   * Последние транзакции пользователя — для будущей страницы истории.
   * Сейчас просто отдаём 50 последних, без пагинации.
   */
  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const items = await ctx.db.pageTransaction.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return items.map((t) => ({
        id: t.id,
        delta: t.delta,
        reason: t.reason,
        balanceAfter: t.balanceAfter,
        documentId: t.documentId,
        paymentId: t.paymentId,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      }));
    }),
});
