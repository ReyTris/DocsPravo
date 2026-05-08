/**
 * Настройка CORS на бакете Yandex Object Storage.
 * Запуск: dotenv -e .env -- npx tsx scripts/set-bucket-cors.ts
 */
import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const {
  OBJECT_STORAGE_ENDPOINT,
  OBJECT_STORAGE_REGION,
  OBJECT_STORAGE_ACCESS_KEY,
  OBJECT_STORAGE_SECRET_KEY,
  OBJECT_STORAGE_BUCKET,
} = process.env;

if (!OBJECT_STORAGE_ACCESS_KEY || !OBJECT_STORAGE_SECRET_KEY || !OBJECT_STORAGE_BUCKET) {
  console.error("Не заданы переменные окружения OBJECT_STORAGE_*. Запускайте через dotenv -e .env --");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: OBJECT_STORAGE_ENDPOINT ?? "https://storage.yandexcloud.net",
  region: OBJECT_STORAGE_REGION ?? "ru-central1",
  credentials: {
    accessKeyId: OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: OBJECT_STORAGE_SECRET_KEY,
  },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function main() {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: OBJECT_STORAGE_BUCKET }));
    console.log(`✓ Бакет создан: ${OBJECT_STORAGE_BUCKET}`);
  } catch (e: any) {
    if (e.name === "BucketAlreadyOwnedByYou" || e.name === "BucketAlreadyExists") {
      console.log(`  Бакет уже существует: ${OBJECT_STORAGE_BUCKET}`);
    } else {
      throw e;
    }
  }

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: OBJECT_STORAGE_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [
              "http://localhost:3000",
              "https://*.prodoki.ru",
              "https://prodoki.ru",
            ],
            AllowedMethods: ["PUT", "GET", "HEAD", "DELETE"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  console.log(`✓ CORS настроен для бакета: ${OBJECT_STORAGE_BUCKET}`);

  const { CORSRules } = await s3.send(new GetBucketCorsCommand({ Bucket: OBJECT_STORAGE_BUCKET }));
  console.log("Текущие правила:", JSON.stringify(CORSRules, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
