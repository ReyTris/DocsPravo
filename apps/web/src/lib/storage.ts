/**
 * Yandex Object Storage клиент. S3-совместимое API.
 * Pre-signed URL для прямой загрузки с клиента (web/mobile) — без прокси через наш сервер.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  const e = env();
  cached = new S3Client({
    endpoint: e.OBJECT_STORAGE_ENDPOINT,
    region: e.OBJECT_STORAGE_REGION,
    credentials: {
      accessKeyId: e.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: e.OBJECT_STORAGE_SECRET_KEY,
    },
    forcePathStyle: true,
  });
  return cached;
}

export async function presignUploadUrl(
  key: string,
  contentType: string,
  expiresInSec = 600,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: env().OBJECT_STORAGE_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSec });
}

export async function presignDownloadUrl(key: string, expiresInSec = 600): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: env().OBJECT_STORAGE_BUCKET,
    Key: key,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSec });
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: env().OBJECT_STORAGE_BUCKET, Key: key }));
}
