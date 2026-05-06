import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ConfirmUploadInput,
  CreateFromTextInput,
  CreateFromTextOutput,
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
import { chargeDocument, refundDocument } from "../services/pages";

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

  /**
   * Создаёт документ из текста, введённого вручную. OCR пропускается —
   * pipeline сразу идёт в классификацию.
   */
  createFromText: protectedProcedure
    .input(CreateFromTextInput)
    .output(CreateFromTextOutput)
    .mutation(async ({ ctx, input }) => {
      const documentId = randomUUID();
      // Postgres text не принимает NUL-байт, а копипаст из PDF/Word нередко
      // приносит \x00 и одиночные суррогаты — чистим до записи в БД.
      const text = input.text
        .replace(/ /g, "")
        .replace(/[\uD800-\uDFFF]/g, "")
        .replace(/\r\n/g, "\n")
        .trim();
      const filename = (input.title?.trim() || "Текстовый документ").slice(0, 255);
      // storageKey должен быть уникальным (constraint в БД), реальных файлов нет.
      const storageKey = `manual-text/${ctx.user.id}/${documentId}`;
      await ctx.db.document.create({
        data: {
          id: documentId,
          userId: ctx.user.id,
          status: "uploaded",
          filename,
          contentType: "text/plain",
          sizeBytes: Buffer.byteLength(text, "utf8"),
          storageKey,
          ocrText: text,
          pagesCharged: 1,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      // Списываем 1 страницу за текстовый разбор. Идемпотентно по documentId.
      try {
        await chargeDocument(ctx.db, {
          userId: ctx.user.id,
          documentId,
          pages: 1,
        });
      } catch (err) {
        // Не хватило баланса — удаляем документ-черновик и пробрасываем ошибку.
        await ctx.db.document.delete({ where: { id: documentId } }).catch(() => {});
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Не удалось списать страницу с баланса",
        });
      }
      // Сразу ставим в очередь — отдельный confirmUpload не нужен.
      await ctx.db.document.update({
        where: { id: documentId },
        data: { status: "ocr_processing" },
      });
      try {
        await enqueuePipelineJob(documentId);
      } catch (err) {
        await ctx.db.document
          .update({ where: { id: documentId }, data: { status: "error" } })
          .catch(() => {});
        await refundDocument(ctx.db, { documentId }).catch(() => {});
        throw err;
      }
      return { documentId };
    }),

  confirmUpload: protectedProcedure
    .input(ConfirmUploadInput)
    .mutation(async ({ ctx, input }) => {
      // Атомарная смена статуса uploaded → ocr_processing + фиксация pagesCharged.
      // updateMany с фильтром по userId+status гарантирует, что только владелец
      // и только один раз переведёт документ в обработку (защита от race).
      const updated = await ctx.db.document.updateMany({
        where: { id: input.documentId, userId: ctx.user.id, status: "uploaded" },
        data: { status: "ocr_processing", pagesCharged: input.pageCount },
      });
      if (updated.count === 0) {
        // Либо документ не найден, либо чужой, либо уже в обработке.
        const exists = await ctx.db.document.findFirst({
          where: { id: input.documentId, userId: ctx.user.id },
          select: { id: true },
        });
        if (!exists) throw new TRPCError({ code: "NOT_FOUND" });
        return { ok: true as const, alreadyProcessing: true };
      }
      // Списываем страницы с баланса. chargeDocument идемпотентен по documentId,
      // так что повторный вызов (после ретрая клиента) не задвоит списание.
      try {
        await chargeDocument(ctx.db, {
          userId: ctx.user.id,
          documentId: input.documentId,
          pages: input.pageCount,
        });
      } catch (err) {
        // Не хватило баланса (или другая ошибка) — откатываем статус, документ
        // остаётся uploaded. Клиент покажет «купите пакет» и повторит позже.
        await ctx.db.document.updateMany({
          where: { id: input.documentId, status: "ocr_processing" },
          data: { status: "uploaded", pagesCharged: null },
        });
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Не удалось списать страницы с баланса",
        });
      }
      try {
        await enqueuePipelineJob(input.documentId);
      } catch (err) {
        // Откатываем статус и возвращаем списанные страницы.
        await ctx.db.document.updateMany({
          where: { id: input.documentId, status: "ocr_processing" },
          data: { status: "uploaded", pagesCharged: null },
        });
        await refundDocument(ctx.db, { documentId: input.documentId }).catch(() => {});
        throw err;
      }
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
      // Не запускаем повторно, если документ уже в обработке — дубль job через
      // singletonKey всё равно не пройдёт, но и статус сбрасывать не надо.
      const inProgress = new Set([
        "ocr_processing",
        "classify_processing",
        "extract_processing",
        "analyze_processing",
      ]);
      if (inProgress.has(doc.status)) {
        return { ok: true as const, alreadyProcessing: true };
      }
      await ctx.db.document.update({
        where: { id: input.id },
        data: { status: "ocr_processing" },
      });
      try {
        await enqueuePipelineJob(input.id);
      } catch (err) {
        await ctx.db.document.update({
          where: { id: input.id },
          data: { status: doc.status },
        });
        throw err;
      }
      return { ok: true as const };
    }),

  /**
   * Отменить обработку документа. Помечает документ как cancelled —
   * воркер проверит статус перед записью результата и не перезапишет его.
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({ where: { id: input.id } });
      if (!doc || doc.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const cancellable = new Set([
        "uploaded",
        "ocr_processing",
        "classify_processing",
        "extract_processing",
        "analyze_processing",
      ]);
      if (!cancellable.has(doc.status)) {
        return { ok: true as const, alreadyDone: true };
      }
      await ctx.db.document.update({
        where: { id: input.id },
        data: { status: "cancelled" },
      });
      // Возврат страниц при отмене. Идемпотентен — если уже был возврат
      // (например, worker успел сам вернуть при ошибке), повторно не сделаем.
      const refund = await refundDocument(ctx.db, { documentId: input.id });
      return { ok: true as const, refundedPages: refund.pages };
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
