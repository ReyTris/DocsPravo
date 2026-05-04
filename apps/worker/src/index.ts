/**
 * Воркер. Один Node-процесс, держит подключение к Postgres через PgBoss.
 *
 * pg-boss 10.x требует явно создавать каждую очередь через createQueue() ДО send/work/schedule.
 */

import PgBoss from "pg-boss";
import { env } from "./env.js";
import { handlePipelineJob } from "./jobs/pipeline.js";
import { handleReminderTick } from "./jobs/reminders.js";
import { handleCleanupTick } from "./jobs/cleanup.js";

const QUEUE_PIPELINE = "pipeline:run";
const QUEUE_REMINDERS = "reminders:tick";
const QUEUE_CLEANUP = "cleanup:tick";

async function main() {
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();

  // pg-boss 10: очереди создаются явно
  await boss.createQueue(QUEUE_PIPELINE);
  await boss.createQueue(QUEUE_REMINDERS);
  await boss.createQueue(QUEUE_CLEANUP);

  // Главный пайплайн обработки документа
  await boss.work<{ documentId: string }>(QUEUE_PIPELINE, async (jobs) => {
    for (const job of jobs) {
      console.log(`[pipeline] start ${job.data.documentId}`);
      try {
        await handlePipelineJob(job.data.documentId);
        console.log(`[pipeline] done ${job.data.documentId}`);
      } catch (err) {
        console.error(`[pipeline] fail ${job.data.documentId}:`, err);
        throw err;
      }
    }
  });

  // Cron: напоминания о сроках — каждые 30 минут
  await boss.schedule(QUEUE_REMINDERS, "*/30 * * * *");
  await boss.work(QUEUE_REMINDERS, async () => {
    await handleReminderTick();
  });

  // Cron: автоудаление просроченных документов — раз в день в 03:00
  await boss.schedule(QUEUE_CLEANUP, "0 3 * * *");
  await boss.work(QUEUE_CLEANUP, async () => {
    await handleCleanupTick();
  });

  console.log("Worker started");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
