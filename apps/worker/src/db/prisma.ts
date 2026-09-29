import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaWorkerGlobal: PrismaClient | undefined;
}

export const prisma =
  global.prismaWorkerGlobal ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prismaWorkerGlobal = prisma;
}
