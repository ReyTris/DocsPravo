/**
 * Главный job: OCR → промт-цепочка → запись результата + создание deadlines.
 */

import { prisma } from "@pravoletter/db";
import { runPipeline, PIPELINE_VERSION } from "@pravoletter/core";
import { downloadObject } from "../storage";
import { ocrDocument } from "../ocr";
import { getProvider } from "../llm";

export async function handlePipelineJob(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error(`Document ${documentId} not found`);

  // ШАГ 0: OCR
  await prisma.document.update({
    where: { id: documentId },
    data: { status: "ocr_processing" },
  });
  const buffer = await downloadObject(doc.storageKey);
  const ocrText = await ocrDocument(buffer, doc.contentType);

  // ШАГ 1-7: промт-цепочка
  await prisma.document.update({
    where: { id: documentId },
    data: { status: "classify_processing", ocrText },
  });
  const provider = getProvider();
  const result = await runPipeline(provider, ocrText);

  // Денормализованные поля для быстрого списка
  let detectedType: string | null = result.classify?.type ?? null;
  let essence: string | null = result.analysis?.essence_one_line ?? null;
  let criticalDeadline: Date | null = null;
  if (result.analysis?.critical_deadline?.date_iso) {
    criticalDeadline = new Date(result.analysis.critical_deadline.date_iso);
  }

  const status =
    result.status === "ok"
      ? "ready"
      : result.status === "stop_redirect_lawyer"
        ? "stop_redirect_lawyer"
        : result.status === "unsupported"
          ? "unsupported"
          : "error";

  // Транзакция: разбор + дедлайны + статус документа
  await prisma.$transaction(async (tx) => {
    await tx.analysis.create({
      data: {
        documentId,
        result: result as unknown as object,
        status: result.status,
        detectedType,
        classifyConfidence: result.classify?.confidence,
        pipelineVersion: PIPELINE_VERSION,
        promptVersions: { classify: "v1", extract: "v1", analyze: "v1" },
        modelName: result.meta.model,
        durationMs: result.meta.duration_ms,
      },
    });

    await tx.document.update({
      where: { id: documentId },
      data: { status, detectedType, essence, criticalDeadline },
    });

    if (result.status === "ok" && result.analysis) {
      // Создаём дедлайны для напоминаний
      if (result.analysis.critical_deadline?.date_iso) {
        await tx.deadline.create({
          data: {
            documentId,
            deadlineAt: new Date(result.analysis.critical_deadline.date_iso),
            description: result.analysis.critical_deadline.what_to_do,
          },
        });
      }
    }
  });
}
