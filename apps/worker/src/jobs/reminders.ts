/**
 * Cron-задача: ищет дедлайны, для которых пора отправить напоминание (за 7, 3, 1 день).
 * Для MVP — простой вариант "за 1 день". Email-провайдер подключаем отдельно.
 */

import { prisma } from "@prodoki/db";

export async function handleReminderTick(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const due = await prisma.deadline.findMany({
    where: {
      remindedAt: null,
      snoozed: false,
      deadlineAt: { gte: now, lte: in24h },
    },
    include: { document: { include: { user: true } } },
    take: 100,
  });

  for (const dl of due) {
    // TODO: отправка email/Telegram. Пока просто помечаем как обработанные.
    console.log(`[reminder] ${dl.document.user?.email ?? "?"} - срок ${dl.deadlineAt.toISOString()}: ${dl.description}`);
    await prisma.deadline.update({
      where: { id: dl.id },
      data: { remindedAt: new Date() },
    });
  }
}
