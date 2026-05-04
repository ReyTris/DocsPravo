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

export async function handleCleanupTick(): Promise<void> {
  const expired = await prisma.document.findMany({
    where: { expiresAt: { lt: new Date() } },
    take: 100,
  });

  for (const doc of expired) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: env.OBJECT_STORAGE_BUCKET, Key: doc.storageKey }));
    } catch (err) {
      console.error(`[cleanup] не удалось удалить ${doc.storageKey}:`, err);
    }
    // Сохраняем метаданные документа, но обнуляем чувствительные поля
    await prisma.document.update({
      where: { id: doc.id },
      data: { ocrText: null, storageKey: `deleted/${doc.id}` },
    });
  }
}
