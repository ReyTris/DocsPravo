/**
 * Схемы публичного API (входы/выходы tRPC-процедур).
 * Используются и на сервере (валидация), и на клиентах (web + mobile).
 */

import { z } from "zod";
import { AnalysisOutputSchema, ExtractOutputSchema, ClassifyOutputSchema } from "./pipeline";

// ---------- Auth ----------

export const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
});
export type TokenPair = z.infer<typeof TokenPair>;

// ---------- Documents ----------

export const DocumentStatus = z.enum([
  "uploaded",
  "ocr_processing",
  "classify_processing",
  "extract_processing",
  "analyze_processing",
  "ready",
  "stop_redirect_lawyer",
  "unsupported",
  "error",
]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const RequestUploadUrlInput = z.object({
  filename: z.string().max(255),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/heic"]),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024), // 20 МБ лимит
});

export const RequestUploadUrlOutput = z.object({
  documentId: z.string().uuid(),
  uploadUrl: z.string().url(),
  uploadFields: z.record(z.string()).optional(), // для S3 POST policy
  expiresInSec: z.number(),
});

export const ConfirmUploadInput = z.object({
  documentId: z.string().uuid(),
});

export const DocumentSummary = z.object({
  id: z.string().uuid(),
  status: DocumentStatus,
  filename: z.string(),
  createdAt: z.string(),
  type: z.string().nullable(),
  essence: z.string().nullable(),
  criticalDeadline: z.string().nullable(),
});
export type DocumentSummary = z.infer<typeof DocumentSummary>;

export const DocumentDetail = DocumentSummary.extend({
  paid: z.boolean(),
  classify: ClassifyOutputSchema.nullable(),
  extract: ExtractOutputSchema.nullable(),
  analysis: AnalysisOutputSchema.nullable(),
});
export type DocumentDetail = z.infer<typeof DocumentDetail>;

// ---------- Payments ----------

export const CreatePaymentInput = z.object({
  documentId: z.string().uuid(),
  product: z.enum(["full_analysis", "urgent_analysis"]),
});

export const CreatePaymentOutput = z.object({
  paymentId: z.string().uuid(),
  confirmationUrl: z.string().url(),
});

// ---------- Pagination ----------

export const Pagination = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(100).default(20),
});
