import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.js";

const s3 = new S3Client({
  endpoint: env.OBJECT_STORAGE_ENDPOINT,
  region: env.OBJECT_STORAGE_REGION,
  credentials: {
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function downloadObject(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.OBJECT_STORAGE_BUCKET, Key: key }));
  const stream = res.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
