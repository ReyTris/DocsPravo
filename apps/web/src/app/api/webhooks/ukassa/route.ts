/**
 * Webhook от ЮKassa. Принимает уведомления о платежах.
 * Безопасность: проверка по IP-белому списку ЮKassa и/или подписи.
 */

import { prisma } from "@pravoletter/db";
import { NextResponse } from "next/server";

interface UkassaEvent {
  event: string;
  object: {
    id: string;
    status: string;
    metadata?: { paymentId?: string };
    receipt_registration?: string;
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as UkassaEvent;

  // TODO: проверка IP-белого списка ЮKassa: 185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, ...

  if (body.event === "payment.succeeded") {
    const ukassaId = body.object.id;
    const payment = await prisma.payment.findUnique({ where: { ukassaId } });
    if (payment && payment.status !== "succeeded") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "succeeded", paidAt: new Date() },
      });
    }
  } else if (body.event === "payment.canceled") {
    const ukassaId = body.object.id;
    await prisma.payment.updateMany({
      where: { ukassaId, status: "pending" },
      data: { status: "canceled" },
    });
  }

  return NextResponse.json({ ok: true });
}
