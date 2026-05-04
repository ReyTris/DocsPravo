/**
 * JWT для access/refresh токенов.
 * Используем jose — работает в Node, edge и React Native (через polyfill).
 *
 * Архитектура:
 * - Access token (15 мин): подписан JWT_SECRET, содержит userId, role.
 * - Refresh token (30 дней): рандомная строка, sha256 хранится в БД.
 *   На вебе кладётся в httpOnly cookie, в мобайле — в secure-storage.
 */

import { SignJWT, jwtVerify } from "jose";
import { randomBytes, createHash } from "node:crypto";
import { env } from "./env.js";

export interface AccessTokenPayload {
  sub: string; // userId
  role: "user" | "admin";
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<{ token: string; expiresAt: number }> {
  const e = env();
  const expiresAt = Math.floor(Date.now() / 1000) + e.JWT_ACCESS_TTL_SEC;
  const secret = new TextEncoder().encode(e.JWT_SECRET);
  const token = await new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setIssuer("pravoletter")
    .sign(secret);
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const e = env();
    const secret = new TextEncoder().encode(e.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { issuer: "pravoletter" });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: (payload.role as "user" | "admin") ?? "user" };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(plain).digest("hex");
  return { plain, hash };
}

export function hashRefreshToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}
