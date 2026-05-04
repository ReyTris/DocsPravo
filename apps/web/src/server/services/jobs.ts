/**
 * Постановка задач в PgBoss-очередь.
 * Воркер живёт в отдельном процессе (apps/worker) и читает ту же БД.
 *
 * pg-boss 10: createQueue обязательно. Делаем идемпотентно — повторный вызов безопасен.
 */

import PgBoss from "pg-boss";
import { env } from "../../lib/env";

let bossPromise: Promise<PgBoss> | null = null;

export const QUEUE_PIPELINE = "pipeline:run";

export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    const boss = new PgBoss(env().DATABASE_URL);
    bossPromise = boss.start().then(async () => {
      await boss.createQueue(QUEUE_PIPELINE);
      return boss;
    });
  }
  return bossPromise;
}

export async function enqueuePipelineJob(documentId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUE_PIPELINE, { documentId }, { retryLimit: 2, retryDelay: 30 });
}
