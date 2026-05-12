import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getBalance, PAGE_PACKAGES, type PagePackageId } from "../services/pages";
import { env } from "../../lib/env";

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

  /** Создаёт платёж в ЮKassa для покупки пакета страниц. */
  buy: protectedProcedure
    .input(z.object({ packageId: z.enum(["pages_3", "pages_10", "pages_30"]) }))
    .output(z.object({ confirmationUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const e = env();
      if (!e.UKASSA_SHOP_ID || !e.UKASSA_SECRET_KEY) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ЮKassa не сконфигурирована" });
      }

      const pkg = PAGE_PACKAGES[input.packageId as PagePackageId];
      const user = await ctx.db.user.findUnique({ where: { id: ctx.user.id } });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

      const idempotency = randomUUID();

      const payment = await ctx.db.payment.create({
        data: {
          userId: ctx.user.id,
          amountKopecks: pkg.priceKopecks,
          product: input.packageId,
          pagesGranted: pkg.pages,
          ukassaIdempotency: idempotency,
        },
      });

      const auth = Buffer.from(`${e.UKASSA_SHOP_ID}:${e.UKASSA_SECRET_KEY}`).toString("base64");
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15_000);
      let res: Response;
      try {
        res = await fetch("https://api.yookassa.ru/v3/payments", {
          method: "POST",
          signal: ac.signal,
          headers: {
            Authorization: `Basic ${auth}`,
            "Idempotence-Key": idempotency,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: { value: (pkg.priceKopecks / 100).toFixed(2), currency: "RUB" },
            confirmation: {
              type: "redirect",
              return_url: `${e.PUBLIC_BASE_URL}/upload?paid=1`,
            },
            capture: true,
            description: `Пакет страниц: ${pkg.pages} шт.`,
            metadata: { paymentId: payment.id },
            receipt: {
              customer: { email: user.email },
              items: [
                {
                  description: `Информационная услуга: пакет ${pkg.pages} страниц`,
                  quantity: "1.00",
                  amount: { value: (pkg.priceKopecks / 100).toFixed(2), currency: "RUB" },
                  vat_code: 1,
                  payment_subject: "service",
                  payment_mode: "full_payment",
                },
              ],
            },
          }),
        });
      } catch (err) {
        clearTimeout(timer);
        const aborted = err instanceof Error && err.name === "AbortError";
        console.error("[pages.buy] ukassa request failed", err);
        throw new TRPCError({
          code: aborted ? "TIMEOUT" : "INTERNAL_SERVER_ERROR",
          message: aborted ? "Платёжный шлюз не отвечает" : "Ошибка платёжного шлюза",
        });
      }
      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[pages.buy] ukassa ${res.status}: ${body}`);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ошибка платёжного шлюза" });
      }

      const data = (await res.json()) as {
        id: string;
        confirmation: { confirmation_url: string };
      };

      await ctx.db.payment.update({
        where: { id: payment.id },
        data: { ukassaId: data.id, confirmationUrl: data.confirmation.confirmation_url },
      });

      return { confirmationUrl: data.confirmation.confirmation_url };
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
