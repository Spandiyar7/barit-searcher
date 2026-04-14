import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const MISSING_DATABASE_MESSAGE =
  "Database is not configured. Add DATABASE_URL (and DIRECT_URL for migrations) in .env.local.";

const createFallbackPrisma = () => {
  const modelProxy = new Proxy(
    {},
    {
      get(_, method: string | symbol) {
        if (typeof method !== "string") return undefined;

        if (method === "count") return async () => 0;
        if (method === "findMany") return async () => [];
        if (method === "groupBy") return async () => [];
        if (method === "findUnique" || method === "findFirst") return async () => null;
        if (method === "aggregate") return async () => ({});

        return async () => {
          throw new Error(MISSING_DATABASE_MESSAGE);
        };
      }
    }
  );

  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (typeof prop !== "string") return undefined;
        if (prop === "$connect" || prop === "$disconnect") return async () => undefined;
        return modelProxy;
      }
    }
  ) as PrismaClient;
};

const prismaClient =
  process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0
    ? new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
      })
    : createFallbackPrisma();

export const prisma = globalForPrisma.prisma || prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
