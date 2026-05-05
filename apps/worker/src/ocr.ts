/**
 * Извлечение текста из документа.
 *
 * Стратегия для PDF: сначала пробуем текстовый слой через pdf-parse (быстро,
 * бесплатно, без потерь). Если слоя нет или он мусорный — это скан, отправляем
 * в Yandex Vision OCR.
 *
 * Для картинок (jpeg/png/heic) сразу идёт OCR.
 *
 * Документация Yandex Vision: https://cloud.yandex.ru/docs/vision/operations/ocr/text-detection-doc
 */

import pdfParse from "pdf-parse/lib/pdf-parse.js";
import sharp from "sharp";
import { env } from "./env";

const MIN_TEXT_LAYER_CHARS = 80;
const MIN_PRINTABLE_RATIO = 0.6;

// Yandex Vision: лимит 10 МБ на запрос и 20 МП. 1800 px — мелкий печатный
// текст (реквизиты, печати) ещё читается, но запрос ужимается ещё сильнее,
// что заметно ускоряет передачу и саму OCR-обработку.
const MAX_LONG_SIDE_PX = 1800;
const JPEG_QUALITY = 80;

export async function ocrDocument(buffer: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const fromLayer = await tryExtractPdfTextLayer(buffer);
    if (fromLayer) return fromLayer;
    return ocrViaYandexVision(buffer, mime);
  }
  const { buffer: prepared, mime: preparedMime } = await preprocessImage(buffer, mime);
  return ocrViaYandexVision(prepared, preparedMime);
}

export async function preprocessImage(
  buffer: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const img = sharp(buffer, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    const longSide = Math.max(meta.width ?? 0, meta.height ?? 0);
    let pipeline = img;
    if (longSide > MAX_LONG_SIDE_PX) {
      pipeline = pipeline.resize({
        width: meta.width && meta.width >= (meta.height ?? 0) ? MAX_LONG_SIDE_PX : undefined,
        height: meta.height && meta.height > (meta.width ?? 0) ? MAX_LONG_SIDE_PX : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const out = await pipeline
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { buffer: out, mime: "image/jpeg" };
  } catch {
    return { buffer, mime };
  }
}

async function tryExtractPdfTextLayer(buffer: Buffer): Promise<string | null> {
  try {
    const parsed = await pdfParse(buffer);
    const text = (parsed.text ?? "").trim();
    if (text.length < MIN_TEXT_LAYER_CHARS) return null;
    if (printableRatio(text) < MIN_PRINTABLE_RATIO) return null;
    return text;
  } catch {
    return null;
  }
}

function printableRatio(s: string): number {
  if (!s) return 0;
  let printable = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    // буквы/цифры/пунктуация/пробелы кириллицы и латиницы
    if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x0400 && code <= 0x04ff) ||
      code === 0x09 || code === 0x0a || code === 0x0d
    ) {
      printable++;
    }
  }
  return printable / s.length;
}

// Глобальный сериализатор вызовов Yandex Vision: квота — жёсткий 1 RPS на
// фолдер. Параллельный download/preprocess это не ограничивает,
// сериализуется только сам HTTP-запрос. Соседние старты разнесены минимум
// на VISION_MIN_INTERVAL_MS, что гарантированно укладывается в квоту без 429.
const VISION_MIN_INTERVAL_MS = 1100;
let visionGate: Promise<void> = Promise.resolve();

function scheduleVisionSlot(): Promise<void> {
  const prev = visionGate;
  let release: () => void = () => {};
  visionGate = new Promise<void>((res) => {
    release = res;
  });
  return prev.then(() => {
    setTimeout(() => release(), VISION_MIN_INTERVAL_MS);
  });
}

async function ocrViaYandexVision(buffer: Buffer, mime: string): Promise<string> {
  if (!env.YANDEX_VISION_API_KEY || !env.YANDEX_VISION_FOLDER_ID) {
    throw new Error("Yandex Vision не сконфигурирован");
  }
  const body = JSON.stringify({
    mimeType: mime,
    languageCodes: ["ru", "en"],
    model: "page",
    content: buffer.toString("base64"),
  });
  const headers = {
    Authorization: `Api-Key ${env.YANDEX_VISION_API_KEY}`,
    "Content-Type": "application/json",
    "x-folder-id": env.YANDEX_VISION_FOLDER_ID,
    "x-data-logging-enabled": "false",
  };

  const MAX_ATTEMPTS = 4;
  // Слот в очереди гарантирует ≤ 1 RPS глобально; ретраи — страховка от
  // соседних воркеров и кратковременных скачков.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await scheduleVisionSlot();
    const res = await fetch("https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText", {
      method: "POST",
      headers,
      body,
    });
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const delay = attempt * 1500;
      console.warn(`[ocr] 429 от Yandex Vision, попытка ${attempt}/${MAX_ATTEMPTS}, ждём ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (!res.ok) throw new Error(`Yandex Vision: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { result: { textAnnotation: { fullText: string } } };
    return data.result.textAnnotation.fullText ?? "";
  }
  throw new Error("Yandex Vision: исчерпаны попытки после 429");
}
