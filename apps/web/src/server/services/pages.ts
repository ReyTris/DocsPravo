/**
 * Тонкая обёртка над @pravoletter/db pages: ловит InsufficientBalanceError
 * и кидает TRPCError, который правильно сериализуется на клиенте.
 *
 * Бизнес-логика баланса лежит в packages/db/src/pages.ts — чтобы worker
 * мог пользоваться теми же функциями (refund при ошибках pipeline) без
 * зависимости от tRPC и apps/web.
 */

import { TRPCError } from "@trpc/server";
import {
  chargeDocument as dbChargeDocument,
  grantPurchase as dbGrantPurchase,
  grantSignupBonus as dbGrantSignupBonus,
  refundDocument as dbRefundDocument,
  getBalance,
  InsufficientBalanceError,
  PAGE_PACKAGES,
  SIGNUP_BONUS_PAGES,
  isPagePackageId,
  type PagePackageId,
} from "@pravoletter/db";

export {
  getBalance,
  PAGE_PACKAGES,
  SIGNUP_BONUS_PAGES,
  isPagePackageId,
  type PagePackageId,
};

function toTrpc<T>(p: Promise<T>): Promise<T> {
  return p.catch((err) => {
    if (err instanceof InsufficientBalanceError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
    throw err;
  });
}

export const grantSignupBonus: typeof dbGrantSignupBonus = (db, userId) =>
  toTrpc(dbGrantSignupBonus(db, userId));

export const grantPurchase: typeof dbGrantPurchase = (db, args) =>
  toTrpc(dbGrantPurchase(db, args));

export const chargeDocument: typeof dbChargeDocument = (db, args) =>
  toTrpc(dbChargeDocument(db, args));

export const refundDocument: typeof dbRefundDocument = (db, args) =>
  toTrpc(dbRefundDocument(db, args));
