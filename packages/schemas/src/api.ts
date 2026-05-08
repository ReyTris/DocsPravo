/**
 * Схемы публичного API (входы/выходы tRPC-процедур).
 * Используются и на сервере (валидация), и на клиентах (web + mobile).
 */

import { z } from "zod";
import {
  AnalysisOutputSchema,
  ExtractOutputSchema,
  ClassifyOutputSchema,
  NavigatorOutputSchema,
  StyleEnum,
  StylizedOutputSchema,
  TierEnum,
} from "./pipeline";

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
  "ready_green", // legacy
  "ready_yellow", // legacy
  "stop_redirect_lawyer", // legacy
  "unsupported",
  "error",
  "cancelled",
]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

// Один файл (для одиночной загрузки или одного из массива)
export const FileMeta = z.object({
  filename: z.string().max(255),
  contentType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
  ]),
  sizeBytes: z.number().int().positive().max(30 * 1024 * 1024), // 30 МБ
});
export type FileMeta = z.infer<typeof FileMeta>;

// Ручной ввод текста — пропускает OCR, сразу идёт в классификацию.
export const CreateFromTextInput = z.object({
  text: z.string().min(20).max(50_000),
  title: z.string().max(255).optional(),
  style: StyleEnum.optional(),
});
export type CreateFromTextInput = z.infer<typeof CreateFromTextInput>;

export const CreateFromTextOutput = z.object({
  documentId: z.string().uuid(),
});

// Multi-upload: создаём документ + N файлов, возвращаем pre-signed URL для каждого.
export const RequestUploadUrlsInput = z.object({
  files: z.array(FileMeta).min(1).max(20),
  style: StyleEnum.optional(),
});

export const PresignedFile = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
  filename: z.string(),
});

export const RequestUploadUrlsOutput = z.object({
  documentId: z.string().uuid(),
  files: z.array(PresignedFile),
  expiresInSec: z.number(),
});

// Legacy (одиночный файл) — оставляем для совместимости.
export const RequestUploadUrlInput = FileMeta;
export const RequestUploadUrlOutput = z.object({
  documentId: z.string().uuid(),
  uploadUrl: z.string().url(),
  uploadFields: z.record(z.string()).optional(),
  expiresInSec: z.number(),
});

export const ConfirmUploadInput = z.object({
  documentId: z.string().uuid(),
  // Число страниц, посчитанное на клиенте (PDF — pdf-lib, изображение — 1).
  // Сервер делает sanity-check (1..500), списывает с баланса, потом worker
  // после OCR делает выверку и при необходимости корректирует.
  pageCount: z.number().int().min(1).max(500),
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
  tier: TierEnum.nullable(),
  paid: z.boolean(),
  analysisAvailable: z.boolean(),
  navigator: NavigatorOutputSchema.nullable(),
  classify: ClassifyOutputSchema.nullable(),
  extract: ExtractOutputSchema.nullable(),
  analysis: AnalysisOutputSchema.nullable(),
  style: StyleEnum.nullable(),
  stylized: StylizedOutputSchema.nullable(),
});
export type DocumentDetail = z.infer<typeof DocumentDetail>;

// ---------- Payments ----------

export const CreatePaymentInput = z.object({
  documentId: z.string().uuid(),
  product: z.literal("analysis"),
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
