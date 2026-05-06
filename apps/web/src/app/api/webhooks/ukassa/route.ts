/**
 * Webhook от ЮKassa. Принимает уведомления о платежах.
 * Безопасность: HMAC-подпись (UKASSA_WEBHOOK_SECRET) и/или IP-белый список.
 */

import { prisma } from "@pravoletter/db";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../../../lib/env";

interface UkassaEvent {
  event: string;
  object: {
    id: string;
    status: string;
    metadata?: { paymentId?: string; documentId?: string };
    receipt_registration?: string;
  };
}

// Диапазоны IP, с которых ЮKassa отправляет вебхуки.
// https://yookassa.ru/developers/using-api/webhooks
const UKASSA_IP_RANGES = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "77.75.156.11",
  "77.75.156.35",
  "2a02:5180::/32",
];

function ipToInt(ip: string): bigint | null {
  if (ip.includes(":")) return null; // IPv6 пропускаем для простоты — проверяем по строке
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return BigInt(((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0);
}

function ipInRange(ip: string, range: string): boolean {
  if (!range.includes("/")) return ip === range;
  const [base, bitsStr] = range.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base!);
  if (ipInt === null || baseInt === null) return false;
  if (bits === 0) return true;
  const mask = ((1n << BigInt(bits)) - 1n) << BigInt(32 - bits);
  return (ipInt & mask) === (baseInt & mask);
}

function isUkassaIp(ip: string): boolean {
  return UKASSA_IP_RANGES.some((r) => ipInRange(ip, r));
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request) {
  const e = env();
  const raw = await req.text();

  // 1. HMAC-подпись (если секрет настроен).
  if (e.UKASSA_WEBHOOK_SECRET) {
    const sigHeader = req.headers.get("content-hmac") ?? req.headers.get("x-ukassa-signature");
    if (!sigHeader) {
      return NextResponse.json({ error: "missing signature" }, { status: 401 });
    }
    const expected = createHmac("sha256", e.UKASSA_WEBHOOK_SECRET).update(raw).digest("hex");
    const provided = sigHeader.replace(/^sha256=/, "").trim();
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  } else if (e.NODE_ENV === "production") {
    // В проде без секрета — проверяем по IP.
    const ip = clientIp(req);
    if (!ip || !isUkassaIp(ip)) {
      return NextResponse.json({ error: "untrusted source" }, { status: 401 });
    }
  }

  let body: UkassaEvent;
  try {
    body = JSON.parse(raw) as UkassaEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const ukassaId = body.object?.id;
  if (!ukassaId) return NextResponse.json({ ok: true });

  if (body.event === "payment.succeeded") {
    // Атомарный update с фильтром по documentId (если пришёл) и текущим статусом —
    // защита от race-condition при повторных доставках и от подмены documentId.
    const docId = body.object.metadata?.documentId;
    const result = await prisma.payment.updateMany({
      where: {
        ukassaId,
        status: { not: "succeeded" },
        ...(docId ? { documentId: docId } : {}),
      },
      data: { status: "succeeded", paidAt: new Date() },
    });
    if (result.count === 0) {
      // Либо повторная доставка, либо подозрительный webhook.
      console.warn(`[ukassa] no-op for ${ukassaId} (already succeeded or not found)`);
    }
  } else if (body.event === "payment.canceled") {
    await prisma.payment.updateMany({
      where: { ukassaId, status: "pending" },
      data: { status: "canceled" },
    });
  }

  return NextResponse.json({ ok: true });
}
