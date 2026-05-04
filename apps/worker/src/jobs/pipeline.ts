/**
 * Главный job: OCR всех файлов документа → промт-цепочка → запись результата.
 */

import { prisma } from "@pravoletter/db";
import { runPipeline, PIPELINE_VERSION } from "@pravoletter/core";
import { downloadObject } from "../storage";
import { ocrDocument } from "../ocr";
import { getProvider } from "../llm";

export async function handlePipelineJob(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { files: { orderBy: { position: "asc" } } },
  });
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (doc.status === "cancelled") {
    console.log(`[pipeline] document=${documentId} cancelled before start, skipping`);
    return;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "ocr_processing" },
  });

  // Если есть привязанные файлы — обрабатываем все. Иначе legacy: один storageKey.
  const filesToOcr =
    doc.files.length > 0
      ? doc.files.map((f) => ({
          id: f.id,
          storageKey: f.storageKey,
          contentType: f.contentType,
        }))
      : [{ id: doc.id, storageKey: doc.storageKey, contentType: doc.contentType }];

  // OCR каждого файла; сохраняем текст по файлу + клеим в общий
  const parts: string[] = [];
  for (let i = 0; i < filesToOcr.length; i++) {
    const f = filesToOcr[i]!;
    const buffer = await downloadObject(f.storageKey);
    const text = await ocrDocument(buffer, f.contentType);
    parts.push(`=== Страница ${i + 1} ===\n${text}`);
    if (doc.files.length > 0) {
      await prisma.documentFile.update({
        where: { id: f.id },
        data: { ocrText: text },
      });
    }
  }
  const ocrText = parts.join("\n\n");

  const afterOcr = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true },
  });
  if (afterOcr?.status === "cancelled") {
    console.log(`[pipeline] document=${documentId} cancelled after OCR, skipping LLM`);
    return;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "classify_processing", ocrText },
  });

  const provider = getProvider();
  const result = await runPipeline(provider, ocrText);

  console.log(
    `[pipeline] document=${documentId} pages=${filesToOcr.length} status=${result.status} tier=${result.tier ?? "-"} error=${result.error ?? "-"}`,
  );
  if (result.status === "error") {
    console.error(
      `[pipeline] full result:`,
      JSON.stringify(result, null, 2).slice(0, 2000),
    );
  }

  // Денормализация для списка
  const detectedType =
    result.navigator?.document_kind_normalized ?? result.classify?.type ?? null;
  const essence =
    result.analysis?.essence ??
    result.analysis?.title ??
    result.navigator?.short_summary ??
    null;
  let criticalDeadline: Date | null = null;
  const dlStr =
    result.analysis?.critical_deadline?.date_iso ??
    result.navigator?.key_dates.find((d) => d.date_iso)?.date_iso ??
    null;
  if (dlStr) criticalDeadline = new Date(dlStr);

  const status = (() => {
    switch (result.status) {
      case "ok":
        return "ready" as const;
      case "unsupported":
        return "unsupported" as const;
      default:
        return "error" as const;
    }
  })();

  const beforeWrite = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true },
  });
  if (beforeWrite?.status === "cancelled") {
    console.log(`[pipeline] document=${documentId} cancelled, skipping result write`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.analysis.create({
      data: {
        documentId,
        result: result as unknown as object,
        status: result.status,
        detectedType,
        classifyConfidence: result.classify?.confidence,
        pipelineVersion: PIPELINE_VERSION,
        promptVersions: {
          navigator: "v1",
          classify: "v1",
          extract: "v1",
          analyze: "v1",
        },
        modelName: result.meta.model,
        durationMs: result.meta.duration_ms,
      },
    });

    await tx.document.update({
      where: { id: documentId },
      data: {
        status,
        tier: result.tier ?? null,
        detectedType,
        essence,
        criticalDeadline,
      },
    });

    if (result.status === "ok" && result.analysis?.critical_deadline?.date_iso) {
      await tx.deadline.create({
        data: {
          documentId,
          deadlineAt: new Date(result.analysis.critical_deadline.date_iso),
          description: result.analysis.critical_deadline.what_to_do,
        },
      });
    }
  });
}
