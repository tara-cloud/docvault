import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildPrisma() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : [],
  });
  // Enable SQLite foreign key enforcement on every connection
  client.$executeRawUnsafe("PRAGMA foreign_keys = ON").catch(() => {/* ignore on first connect */});
  return client;
}

export const prisma = globalForPrisma.prisma ?? buildPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
