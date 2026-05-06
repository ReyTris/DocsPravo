/**
 * Автоудаление документов старше 30 дней (152-ФЗ — минимизация хранения).
 */

import { prisma } from "@pravoletter/db";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../env";

const s3 = new S3Client({
  endpoint: env.OBJECT_STORAGE_ENDPOINT,
  region: env.OBJECT_STORAGE_REGION,
  credentials: {
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
  },
  forcePathStyle: true,
});

async function tryDelete(key: string): Promise<boolean> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: env.OBJECT_STORAGE_BUCKET, Key: key }));
    return true;
  } catch (err) {
    console.error(`[cleanup] не удалось удалить ${key}:`, err);
    return false;
  }
}

export async function handleCleanupTick(): Promise<void> {
  const expired = await prisma.document.findMany({
    where: {
      expiresAt: { lt: new Date() },
      // Не выбираем уже почищенные документы (storageKey начинается с "deleted/").
      NOT: { storageKey: { startsWith: "deleted/" } },
    },
    include: { files: true },
    take: 100,
  });

  for (const doc of expired) {
    // Собираем все ключи: legacy doc.storageKey + все DocumentFile.storageKey.
    const keys = new Set<string>();
    if (doc.storageKey && !doc.storageKey.startsWith("deleted/")) keys.add(doc.storageKey);
    for (const f of doc.files) {
      if (f.storageKey && !f.storageKey.startsWith("deleted/")) keys.add(f.storageKey);
    }

    let allOk = true;
    for (const key of keys) {
      if (!(await tryDelete(key))) allOk = false;
    }

    if (!allOk) {
      // Не помечаем как удалённый — повторим на следующем тике.
      continue;
    }

    // Сохраняем метаданные документа, но обнуляем чувствительные поля и помечаем удаление.
    // storageKey @unique — для каждого файла префиксуем уникальным id.
    await prisma.$transaction([
      ...doc.files.map((f) =>
        prisma.documentFile.update({
          where: { id: f.id },
          data: { ocrText: null, storageKey: `deleted/${doc.id}/${f.id}` },
        }),
      ),
      prisma.document.update({
        where: { id: doc.id },
        data: { ocrText: null, storageKey: `deleted/${doc.id}` },
      }),
    ]);
  }
}
