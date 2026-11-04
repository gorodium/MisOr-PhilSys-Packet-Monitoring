import { PrismaClient } from "@prisma/client";

function buildDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "30");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
};

const resolvedUrl = buildDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma && globalForPrisma.prismaUrl === resolvedUrl
    ? globalForPrisma.prisma
    : new PrismaClient({
        ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {}),
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
      });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUrl = resolvedUrl;
}
