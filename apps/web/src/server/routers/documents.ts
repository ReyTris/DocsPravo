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
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 дней
        },
      });

      const uploadUrl = await presignUploadUrl(storageKey, input.contentType, expiresInSec);

      return { documentId, uploadUrl, expiresInSec };
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
          payments: { where: { status: "succeeded" }, take: 1 },
        },
      });
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const analysis = doc.analyses[0];
      const result = analysis?.result as
        | { classify?: unknown; extract?: unknown; analysis?: unknown }
        | undefined;
      const paid = doc.payments.length > 0;

      return {
        id: doc.id,
        status: doc.status,
        filename: doc.filename,
        createdAt: doc.createdAt.toISOString(),
        type: doc.detectedType,
        essence: doc.essence,
        criticalDeadline: doc.criticalDeadline?.toISOString() ?? null,
        paid,
        // Бесплатно показываем только classify (тип, суть). Extract и analysis — только после оплаты.
        classify: (result?.classify as DocumentDetail["classify"]) ?? null,
        extract: paid ? ((result?.extract as DocumentDetail["extract"]) ?? null) : null,
        analysis: paid ? ((result?.analysis as DocumentDetail["analysis"]) ?? null) : null,
      };
    }),
});
