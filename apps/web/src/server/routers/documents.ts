import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ConfirmUploadInput,
  DocumentDetail,
  DocumentSummary,
  Pagination,
  RequestUploadUrlInput,
  RequestUploadUrlOutput,
  RequestUploadUrlsInput,
  RequestUploadUrlsOutput,
} from "@pravoletter/schemas";
import { router, protectedProcedure } from "../trpc";
import { presignUploadUrl } from "../../lib/storage";
import { enqueuePipelineJob } from "../services/jobs";

export const documentsRouter = router({
  /**
   * Шаг 1 загрузки: клиент запрашивает pre-signed URL и заводит пустой Document в БД.
   * Шаг 2: клиент кладёт файл напрямую в Object Storage.
   * Шаг 3: клиент вызывает confirmUpload — мы ставим job на OCR + пайплайн.
   */
  // Legacy: одиночная загрузка. Новые клиенты используют requestUploadUrls.
  requestUploadUrl: protectedProcedure
    .input(RequestUploadUrlInput)
    .output(RequestUploadUrlOutput)
    .mutation(async ({ ctx, input }) => {
      const documentId = randomUUID();
      const storageKey = `uploads/${ctx.user.id}/${documentId}/${input.filename}`;
      const expiresInSec = 600;

      await ctx.db.document.create({
        data: {
          id: documentId,
          userId: ctx.user.id,
          status: "uploaded",
          filename: input.filename,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          storageKey,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          files: {
            create: {
              filename: input.filename,
              contentType: input.contentType,
              sizeBytes: input.sizeBytes,
              storageKey,
              position: 0,
            },
          },
        },
      });

      const uploadUrl = await presignUploadUrl(storageKey, input.contentType, expiresInSec);
      return { documentId, uploadUrl, expiresInSec };
    }),

  // Multi-upload: создаём один Document и N файлов внутри него.
  requestUploadUrls: protectedProcedure
    .input(RequestUploadUrlsInput)
    .output(RequestUploadUrlsOutput)
    .mutation(async ({ ctx, input }) => {
      const documentId = randomUUID();
      const expiresInSec = 600;

      // Подготавливаем метаданные файлов с уникальными storageKey
      const filesData = input.files.map((f, idx) => {
        const fileId = randomUUID();
        const safeName = f.filename.replace(/[^\w.\-]/g, "_");
        return {
          fileId,
          filename: f.filename,
          safeName,
          contentType: f.contentType,
          sizeBytes: f.sizeBytes,
          position: idx,
          storageKey: `uploads/${ctx.user.id}/${documentId}/${fileId}_${safeName}`,
        };
      });

      // Первый файл становится "главным" для legacy-полей Document.
      const first = filesData[0]!;

      await ctx.db.document.create({
        data: {
          id: documentId,
          userId: ctx.user.id,
          status: "uploaded",
          filename: first.filename,
          contentType: first.contentType,
          sizeBytes: filesData.reduce((sum, f) => sum + f.sizeBytes, 0),
          storageKey: first.storageKey,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          files: {
            create: filesData.map((f) => ({
              id: f.fileId,
              filename: f.filename,
              contentType: f.contentType,
              sizeBytes: f.sizeBytes,
              storageKey: f.storageKey,
              position: f.position,
            })),
          },
        },
      });

      const presigned = await Promise.all(
        filesData.map(async (f) => ({
          fileId: f.fileId,
          uploadUrl: await presignUploadUrl(f.storageKey, f.contentType, expiresInSec),
          filename: f.filename,
        })),
      );

      return { documentId, files: presigned, expiresInSec };
    }),

  confirmUpload: protectedProcedure
    .input(ConfirmUploadInput)
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({
        where: { id: input.documentId },
      });
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (doc.status !== "uploaded") {
        return { ok: true as const, alreadyProcessing: true };
      }
      await enqueuePipelineJob(input.documentId);
      await ctx.db.document.update({
        where: { id: input.documentId },
        data: { status: "ocr_processing" },
      });
      return { ok: true as const };
    }),

  /**
   * Перезапустить pipeline для документа. Полезно если изменились промты или
   * нужно перепрогнать старый документ под новой логикой.
   */
  reprocess: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({ where: { id: input.id } });
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await enqueuePipelineJob(input.id);
      await ctx.db.document.update({
        where: { id: input.id },
        data: { status: "ocr_processing" },
      });
      return { ok: true as const };
    }),

  list: protectedProcedure
    .input(Pagination)
    .output(z.object({ items: z.array(DocumentSummary), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.document.findMany({
        where: { userId: ctx.user.id },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
      });
      const hasMore = items.length > input.limit;
      const trimmed = hasMore ? items.slice(0, -1) : items;
      return {
        items: trimmed.map((d) => ({
          id: d.id,
          status: d.status,
          filename: d.filename,
          createdAt: d.createdAt.toISOString(),
          type: d.detectedType,
          essence: d.essence,
          criticalDeadline: d.criticalDeadline?.toISOString() ?? null,
        })),
        nextCursor: hasMore ? trimmed[trimmed.length - 1]!.id : null,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(DocumentDetail)
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({
        where: { id: input.id },
        include: {
          analyses: { orderBy: { createdAt: "desc" }, take: 1 },
          payments: { where: { status: "succeeded" } },
        },
      });
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const analysis = doc.analyses[0];
      const result = analysis?.result as
        | {
            tier?: DocumentDetail["tier"];
            navigator?: DocumentDetail["navigator"];
            classify?: DocumentDetail["classify"];
            extract?: DocumentDetail["extract"];
            analysis?: DocumentDetail["analysis"];
          }
        | undefined;

      const paid = doc.payments.some((p) => p.status === "succeeded");
      const tier = doc.tier ?? result?.tier ?? null;

      // Audit для red-документов: фиксируем каждое открытие. Это пригодится в суде —
      // доказательство, что пользователь видел разбор и подтвердил риск.
      if (tier === "red") {
        await ctx.db.auditLog.create({
          data: {
            userId: ctx.user.id,
            action: "open_red_document",
            entity: "Document",
            entityId: doc.id,
            ip: ctx.ip ?? undefined,
            userAgent: ctx.userAgent ?? undefined,
          },
        });
      }

      return {
        id: doc.id,
        status: doc.status,
        filename: doc.filename,
        createdAt: doc.createdAt.toISOString(),
        type: doc.detectedType,
        essence: doc.essence,
        criticalDeadline: doc.criticalDeadline?.toISOString() ?? null,
        tier,
        paid,
        analysisAvailable: !!result?.analysis,
        navigator: result?.navigator ?? null,
        classify: result?.classify ?? null,
        extract: paid ? (result?.extract ?? null) : null,
        analysis: paid ? (result?.analysis ?? null) : null,
      };
    }),
});
