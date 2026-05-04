/**
 * OCR через Yandex Vision API.
 * Документация: https://cloud.yandex.ru/docs/vision/operations/ocr/text-detection-doc
 */

import { env } from "./env";

export async function ocrDocument(buffer: Buffer, mime: string): Promise<string> {
  if (!env.YANDEX_VISION_API_KEY || !env.YANDEX_VISION_FOLDER_ID) {
    throw new Error("Yandex Vision не сконфигурирован");
  }
  const res = await fetch("https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText", {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${env.YANDEX_VISION_API_KEY}`,
      "Content-Type": "application/json",
      "x-folder-id": env.YANDEX_VISION_FOLDER_ID,
      "x-data-logging-enabled": "false",
    },
    body: JSON.stringify({
      mimeType: mime,
      languageCodes: ["ru", "en"],
      model: "page",
      content: buffer.toString("base64"),
    }),
  });
  if (!res.ok) throw new Error(`Yandex Vision: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result: { textAnnotation: { fullText: string } } };
  return data.result.textAnnotation.fullText ?? "";
}
