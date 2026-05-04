import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { CreatePaymentInput, CreatePaymentOutput } from "@pravoletter/schemas";
import { router, protectedProcedure } from "../trpc";
import { env } from "../../lib/env";

const PRODUCT_PRICES_KOPECKS = {
  full_analysis: 59000, // 590 ₽
  urgent_analysis: 88000, // 880 ₽
} as const;

export const paymentsRouter = router({
  create: protectedProcedure
    .input(CreatePaymentInput)
    .output(CreatePaymentOutput)
    .mutation(async ({ ctx, input }) => {
      const [doc, user] = await Promise.all([
        ctx.db.document.findUnique({ where: { id: input.documentId } }),
        ctx.db.user.findUnique({ where: { id: ctx.user.id } }),
      ]);
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const amount = PRODUCT_PRICES_KOPECKS[input.product];
      const idempotency = randomUUID();
      const e = env();

      // Создаём pending-payment в БД ДО обращения в ЮKassa.
      const payment = await ctx.db.payment.create({
        data: {
          userId: ctx.user.id,
          documentId: input.documentId,
          amountKopecks: amount,
          product: input.product,
          ukassaIdempotency: idempotency,
        },
      });

      if (!e.UKASSA_SHOP_ID || !e.UKASSA_SECRET_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ЮKassa не сконфигурирована",
        });
      }

      const auth = Buffer.from(`${e.UKASSA_SHOP_ID}:${e.UKASSA_SECRET_KEY}`).toString("base64");
      const res = await fetch("https://api.yookassa.ru/v3/payments", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Idempotence-Key": idempotency,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: { value: (amount / 100).toFixed(2), currency: "RUB" },
          confirmation: {
            type: "redirect",
            return_url: `${e.PUBLIC_BASE_URL}/documents/${input.documentId}?paid=1`,
          },
          capture: true,
          description: `Разбор документа ${input.documentId}`,
          metadata: { paymentId: payment.id, documentId: input.documentId },
          // Самозанятый: чек уходит автоматически в "Мой налог"
          receipt: {
            customer: { email: user.email },
            items: [
              {
                description: "Информационная услуга: разбор документа",
                quantity: "1.00",
                amount: { value: (amount / 100).toFixed(2), currency: "RUB" },
                vat_code: 1,
                payment_subject: "service",
                payment_mode: "full_payment",
              },
            ],
          },
        }),
      });

      if (!res.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `ЮKassa: ${res.status} ${await res.text()}`,
        });
      }

      const data = (await res.json()) as {
        id: string;
        confirmation: { confirmation_url: string };
      };

      await ctx.db.payment.update({
        where: { id: payment.id },
        data: { ukassaId: data.id, confirmationUrl: data.confirmation.confirmation_url },
      });

      return {
        paymentId: payment.id,
        confirmationUrl: data.confirmation.confirmation_url,
      };
    }),
});
