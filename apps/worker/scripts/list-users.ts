import { prisma } from "@pravoletter/db";

const users = await prisma.user.findMany({
  select: { id: true, email: true, balancePages: true, createdAt: true },
  orderBy: { createdAt: "desc" },
  take: 20,
});
for (const u of users) {
  console.log(`${u.email}\t${u.balancePages} pages\t${u.createdAt.toISOString()}\tid=${u.id}`);
}
await prisma.$disconnect();
