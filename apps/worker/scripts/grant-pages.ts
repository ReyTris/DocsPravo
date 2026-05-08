/**
 * Разовый скрипт: начислить страницы на баланс по email.
 * Запуск: pnpm --filter @prodoki/worker exec dotenv -e ../../.env -- tsx scripts/grant-pages.ts <email> <pages> [note]
 */

import { prisma } from "@prodoki/db";

async function main() {
  const [, , email, pagesArg, ...rest] = process.argv;
  if (!email || !pagesArg) {
    console.error("Usage: tsx scripts/grant-pages.ts <email> <pages> [note]");
    process.exit(1);
  }
  const pages = Number(pagesArg);
  if (!Number.isInteger(pages) || pages === 0) {
    console.error("pages must be a non-zero integer");
    process.exit(1);
  }
  const note = rest.join(" ") || `Manual adjustment +${pages} pages`;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, balancePages: true },
  });
  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  // Уникальный ключ — таймштамп, иначе adjustment-операции были бы неотличимы.
  const idempotencyKey = `adjustment:${user.id}:${Date.now()}`;

  const tx = await prisma.$transaction(async (db) => {
    const u = await db.user.findUnique({
      where: { id: user.id },
      select: { balancePages: true },
    });
    const newBalance = (u?.balancePages ?? 0) + pages;
    if (newBalance < 0) throw new Error("balance would go negative");
    await db.user.update({
      where: { id: user.id },
      data: { balancePages: newBalance },
    });
    return db.pageTransaction.create({
      data: {
        userId: user.id,
        delta: pages,
        reason: "adjustment",
        balanceAfter: newBalance,
        idempotencyKey,
        note,
      },
    });
  });

  console.log(
    `OK: user=${email} delta=${pages} balanceAfter=${tx.balanceAfter} txId=${tx.id}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
