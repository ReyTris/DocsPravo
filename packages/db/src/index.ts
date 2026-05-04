// Prisma 5 экспортирует через CJS — в ESM-проектах нужен default-импорт пакета
// и деструктуризация. Иначе SyntaxError "does not provide an export named 'PrismaClient'".
import pkg from "@prisma/client";

const { PrismaClient } = pkg;

const globalForPrisma = globalThis as unknown as { prisma?: InstanceType<typeof PrismaClient> };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type { Prisma } from "@prisma/client";
export { PrismaClient };
