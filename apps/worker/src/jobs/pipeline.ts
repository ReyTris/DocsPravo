/**
 * Главный job: OCR всех файлов документа → промт-цепочка → запись результата.
 */

import { prisma, refundDocument, type Prisma } from "@prodoki/db";
import {
  runPipeline,
  PIPELINE_VERSION,
  runVisionPipeline,
  VISION_PIPELINE_VERSION,
  stylize,
} from "@prodoki/core";
import type { PipelineResult, Style } from "@prodoki/schemas";
import { downloadObject } from "../storage";
import { ocrDocument, preprocessImage } from "../ocr";
import { getProvider } from "../llm";
import { env } from "../env";

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

  try {
    await runPipelineJob(documentId, doc as DocWithFiles);
  } catch (err) {
    await prisma.document
      .update({ where: { id: documentId }, data: { status: "error" } })
      .catch(() => {});
    // Возврат страниц при любой неуправляемой ошибке pipeline.
    // Идемпотентен — если refund уже был сделан, повторно не вернёт.
    await refundDocument(prisma, {
      documentId,
      note: "Возврат: исключение в pipeline",
    }).catch((e) => {
      console.error(`[pipeline] document=${documentId} refund failed:`, e);
    });
    throw err;
  }
}

type DocWithFiles = Prisma.DocumentGetPayload<{
  include: { files: true };
}>;

async function runPipelineJob(documentId: string, doc: DocWithFiles): Promise<void> {
  // Если есть привязанные файлы — обрабатываем все. Иначе legacy: один storageKey.
  type FileToProcess = { id: string; storageKey: string; contentType: string };
  const filesToProcess: FileToProcess[] =
    doc.files.length > 0
      ? doc.files.map((f: FileToProcess) => ({
          id: f.id,
          storageKey: f.storageKey,
          contentType: f.contentType,
        }))
      : [{ id: doc.id, storageKey: doc.storageKey, contentType: doc.contentType }];

  let result: PipelineResult;
  let pipelineVersion: string;
  let ocrText: string | null = null;
  const tStart = Date.now();

  // Vision-модель работает только с картинками. Если включена, но в документе
  // есть PDF/DOCX/TXT/manual-text — автоматически откатываемся на OCR-ветку.
  const allImages =
    filesToProcess.length > 0 && filesToProcess.every((f) => f.contentType.startsWith("image/"));
  const useVision = env.USE_VISION_PIPELINE && allImages;

  if (useVision) {
    // === VISION-ВЕТКА: один VL-вызов вместо OCR + 3 LLM ===
    if (!env.YANDEX_API_KEY || !env.YANDEX_FOLDER_ID) {
      throw new Error("USE_VISION_PIPELINE=true: нужны YANDEX_API_KEY и YANDEX_FOLDER_ID");
    }
    // Можно задать как короткое имя ("qwen3.6-35b-a3b/latest"), так и полный
    // URI ("gpt://<folder>/..."). Если без префикса — добавляем сами,
    // как делает YandexGPTProvider.
    const rawModel = env.VISION_MODEL_URI ?? "qwen3.6-35b-a3b/latest";
    const modelUri = rawModel.startsWith("gpt://")
      ? rawModel
      : `gpt://${env.YANDEX_FOLDER_ID}/${rawModel}`;

    const tDownloadStart = Date.now();
    const images = await Promise.all(
      filesToProcess.map(async (f) => {
        const buf = await downloadObject(f.storageKey);
        const prepped = await preprocessImage(buf, f.contentType);
        return prepped;
      }),
    );
    const tDownloadEnd = Date.now();
    const totalBytes = images.reduce((s: number, i) => s + i.buffer.length, 0);
    console.log(
      `[pipeline] document=${documentId} vision download+preprocess=${tDownloadEnd - tDownloadStart}ms ` +
        `pages=${images.length} totalBytes=${totalBytes}`,
    );

    await prisma.document.update({
      where: { id: documentId },
      data: { status: "classify_processing" },
    });

    const tVisionStart = Date.now();
    result = await runVisionPipeline({
      apiKey: env.YANDEX_API_KEY,
      folderId: env.YANDEX_FOLDER_ID,
      modelUri,
      images,
      timeoutMs: env.VISION_TIMEOUT_MS,
      maxTokens: env.VISION_MAX_TOKENS,
    });
    const tVisionEnd = Date.now();
    pipelineVersion = VISION_PIPELINE_VERSION;

    console.log(
      `[pipeline] document=${documentId} vision pages=${filesToProcess.length} ` +
        `maxTokens=${env.VISION_MAX_TOKENS ?? "auto"} ` +
        `download=${tDownloadEnd - tDownloadStart}ms vision=${tVisionEnd - tVisionStart}ms ` +
        `total=${tVisionEnd - tStart}ms status=${result.status} tier=${result.tier ?? "-"} ` +
        `error=${result.error ?? "-"} model=${modelUri}`,
    );
  } else if (doc.files.length === 0 && doc.ocrText && doc.ocrText.trim().length > 0) {
    // === МАНУАЛЬНЫЙ ТЕКСТ: OCR пропускается, текст уже в БД ===
    ocrText = doc.ocrText;
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "classify_processing" },
    });
    const provider = getProvider();
    const tLlmStart = Date.now();
    result = await runPipeline(provider, ocrText);
    const tLlmEnd = Date.now();
    pipelineVersion = PIPELINE_VERSION;
    console.log(
      `[pipeline] document=${documentId} manual-text llmPhase=${tLlmEnd - tLlmStart}ms ` +
        `status=${result.status} tier=${result.tier ?? "-"} error=${result.error ?? "-"}`,
    );
  } else {
    // === OCR-ВЕТКА (классическая) ===
    const tOcrStart = Date.now();
    const perFileTimings: Array<{ idx: number; download: number; ocr: number; bytes: number }> = [];

    const texts: string[] = new Array(filesToProcess.length);
    await runWithConcurrency(filesToProcess.length, env.OCR_CONCURRENCY, async (i) => {
      const f = filesToProcess[i]!;
      const tDl = Date.now();
      const buffer = await downloadObject(f.storageKey);
      const tOcr = Date.now();
      const text = await ocrDocument(buffer, f.contentType);
      const tEnd = Date.now();
      texts[i] = text;
      perFileTimings.push({
        idx: i,
        download: tOcr - tDl,
        ocr: tEnd - tOcr,
        bytes: buffer.length,
      });
      if (doc.files.length > 0) {
        await prisma.documentFile.update({
          where: { id: f.id },
          data: { ocrText: text },
        });
      }
    });

    ocrText = texts
      .map((t, i) => `=== Страница ${i + 1} ===\n${t}`)
      .join("\n\n");
    const tOcrEnd = Date.now();
    perFileTimings.sort((a, b) => a.idx - b.idx);
    console.log(
      `[pipeline] document=${documentId} ocrPhase=${tOcrEnd - tOcrStart}ms ` +
        `files=${filesToProcess.length} concurrency=${env.OCR_CONCURRENCY} ` +
        `perFile=${JSON.stringify(perFileTimings)}`,
    );

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
    const tLlmStart = Date.now();
    result = await runPipeline(provider, ocrText);
    const tLlmEnd = Date.now();
    pipelineVersion = PIPELINE_VERSION;

    console.log(
      `[pipeline] document=${documentId} pages=${filesToProcess.length} ` +
        `ocrPhase=${tOcrEnd - tOcrStart}ms llmPhase=${tLlmEnd - tLlmStart}ms ` +
        `status=${result.status} tier=${result.tier ?? "-"} error=${result.error ?? "-"}`,
    );
  }

  if (result.status === "error") {
    console.error(
      `[pipeline] full result:`,
      JSON.stringify(result, null, 2).slice(0, 2000),
    );
  }

  // Опциональная стилизация. Шаг идёт ПОСЛЕ основного pipeline и не влияет
  // на юридическую часть результата — просто добавляет stylized-блок к analysis.
  // Если упадёт — основной разбор всё равно остаётся валидным.
  // doc.style — новое поле; при первом запуске после миграции prisma generate
  // мог быть заблокирован running-процессом, поэтому читаем через unknown-cast.
  const style = ((doc as unknown as { style: string | null }).style as Style | null) ?? null;
  if (style && style !== "normal" && result.status === "ok" && result.analysis) {
    try {
      const tStyleStart = Date.now();
      const stylized = await stylize(
        getProvider(),
        result.analysis,
        style,
        result.navigator ?? null,
      );
      if (stylized) {
        result = { ...result, stylized };
      }
      console.log(
        `[pipeline] document=${documentId} stylize style=${style} ` +
          `duration=${Date.now() - tStyleStart}ms ok=${!!stylized}`,
      );
    } catch (err) {
      console.warn(`[pipeline] document=${documentId} stylize failed:`, err);
    }
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
        pipelineVersion,
        promptVersions: env.USE_VISION_PIPELINE
          ? { vision: "v1" }
          : { navigator: "v1", classify: "v1", extract: "v1", analyze: "v1" },
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

  // Возврат страниц при «штатных плохих» исходах. Транзакция выше уже зафиксировала
  // финальный статус; refund делаем отдельно — он идемпотентен по documentId.
  if (status === "unsupported" || status === "error") {
    const refund = await refundDocument(prisma, {
      documentId,
      note:
        status === "unsupported"
          ? "Возврат: документ не подходит под профиль сервиса"
          : `Возврат: ошибка pipeline (${result.error ?? "unknown"})`,
    }).catch((e) => {
      console.error(`[pipeline] document=${documentId} refund failed:`, e);
      return { refunded: false, pages: 0 };
    });
    if (refund.refunded) {
      console.log(
        `[pipeline] document=${documentId} refunded ${refund.pages} pages (status=${status})`,
      );
    }
  }
}

/**
 * Запускает обработку индексов 0..count-1 пачками по limit штук одновременно.
 * Без внешних зависимостей (p-limit в монорепо нет).
 */
async function runWithConcurrency(
  count: number,
  limit: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, count) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= count) return;
      await task(i);
    }
  });
  await Promise.all(workers);
}
