/**
 * Управление балансом страниц.
 *
 * Источник истины — таблица PageTransaction. User.balancePages — денормализация
 * для быстрого чтения; обновляется ВСЕГДА в одной транзакции с PageTransaction.
 *
 * Идемпотентность: бизнес-операции пишутся с уникальным idempotencyKey,
 * повторный вызов с тем же ключом вернёт существующую запись и не изменит
 * баланс. Защищает от двойных webhook'ов ЮKassa, дублей при ретраях pg-boss
 * и от race при параллельных операциях.
 *
 * Лежит в packages/db, чтобы импортировалось и из web (роутеры), и из
 * worker (refund при ошибках pipeline).
 */

import type { Prisma, PrismaClient } from "@prisma/client";

// Любой клиент Prisma — обычный или внутри $transaction.
type Db = InstanceType<typeof PrismaClient> | Prisma.TransactionClient;

export const SIGNUP_BONUS_PAGES = 1;

export const PAGE_PACKAGES = {
  pages_3: { pages: 3, priceKopecks: 99_00 },
  pages_10: { pages: 10, priceKopecks: 199_00 },
  pages_30: { pages: 30, priceKopecks: 399_00 },
} as const satisfies Record<string, { pages: number; priceKopecks: number }>;

export type PagePackageId = keyof typeof PAGE_PACKAGES;

export function isPagePackageId(s: string): s is PagePackageId {
  return Object.prototype.hasOwnProperty.call(PAGE_PACKAGES, s);
}

/** Кидается, когда списание не помещается в баланс. */
export class InsufficientBalanceError extends Error {
  readonly code = "INSUFFICIENT_BALANCE";
  constructor(message = "Недостаточно страниц на балансе") {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

export async function getBalance(db: Db, userId: string): Promise<number> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { balancePages: true } });
  return u?.balancePages ?? 0;
}

/**
 * Универсальная запись транзакции баланса.
 * - Атомарно меняет User.balancePages и пишет PageTransaction.
 * - Если idempotencyKey уже использован — возвращает существующую запись.
 * - При попытке списать больше, чем есть — кидает InsufficientBalanceError.
 */
async function applyDelta(
  db: Db,
  args: {
    userId: string;
    delta: number;
    reason:
      | "signup_bonus"
      | "purchase"
      | "document_charge"
      | "document_refund"
      | "adjustment";
    idempotencyKey?: string | null;
    documentId?: string | null;
    paymentId?: string | null;
    note?: string;
  },
) {
  const run = async (tx: Db) => {
    if (args.idempotencyKey) {
      const existing = await tx.pageTransaction.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
      });
      if (existing) return existing;
    }

    const user = await tx.user.findUnique({
      where: { id: args.userId },
      select: { balancePages: true },
    });
    if (!user) throw new Error(`User ${args.userId} not found`);

    const newBalance = user.balancePages + args.delta;
    if (newBalance < 0) {
      throw new InsufficientBalanceError();
    }

    await tx.user.update({
      where: { id: args.userId },
      data: { balancePages: newBalance },
    });

    return tx.pageTransaction.create({
      data: {
        userId: args.userId,
        delta: args.delta,
        reason: args.reason,
        balanceAfter: newBalance,
        idempotencyKey: args.idempotencyKey ?? null,
        documentId: args.documentId ?? null,
        paymentId: args.paymentId ?? null,
        note: args.note ?? null,
      },
    });
  };

  if ("$transaction" in db) {
    return db.$transaction(run);
  }
  return run(db);
}

/** Приветственный бонус при регистрации. Идемпотентен по userId. */
export function grantSignupBonus(db: Db, userId: string) {
  return applyDelta(db, {
    userId,
    delta: SIGNUP_BONUS_PAGES,
    reason: "signup_bonus",
    idempotencyKey: `signup_bonus:${userId}`,
    note: "Стартовая страница",
  });
}

/** Начисление за оплаченный пакет. Идемпотентно по paymentId. */
export function grantPurchase(
  db: Db,
  args: { userId: string; paymentId: string; pages: number },
) {
  return applyDelta(db, {
    userId: args.userId,
    delta: args.pages,
    reason: "purchase",
    idempotencyKey: `purchase:${args.paymentId}`,
    paymentId: args.paymentId,
  });
}

/** Списание за документ при confirmUpload. Идемпотентно по documentId. */
export function chargeDocument(
  db: Db,
  args: { userId: string; documentId: string; pages: number },
) {
  if (args.pages <= 0) {
    throw new Error("Число страниц для списания должно быть положительным");
  }
  return applyDelta(db, {
    userId: args.userId,
    delta: -args.pages,
    reason: "document_charge",
    idempotencyKey: `document_charge:${args.documentId}`,
    documentId: args.documentId,
  });
}

/**
 * Возврат за документ при ошибке pipeline / cancel.
 * Идемпотентен по documentId. Возвращает только если ранее было списание
 * по этому документу и возврата ещё не было.
 */
export async function refundDocument(
  db: Db,
  args: { documentId: string; note?: string },
): Promise<{ refunded: boolean; pages: number }> {
  const run = async (tx: Db) => {
    const charge = await tx.pageTransaction.findUnique({
      where: { idempotencyKey: `document_charge:${args.documentId}` },
    });
    if (!charge) return { refunded: false, pages: 0 };

    const existingRefund = await tx.pageTransaction.findUnique({
      where: { idempotencyKey: `document_refund:${args.documentId}` },
    });
    if (existingRefund) return { refunded: false, pages: 0 };

    const pages = -charge.delta;
    await applyDelta(tx, {
      userId: charge.userId,
      delta: pages,
      reason: "document_refund",
      idempotencyKey: `document_refund:${args.documentId}`,
      documentId: args.documentId,
      note: args.note ?? "Возврат при ошибке обработки",
    });
    return { refunded: true, pages };
  };

  if ("$transaction" in db) {
    return db.$transaction(run);
  }
  return run(db);
}
