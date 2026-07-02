import { NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const forbidden = requireAdmin(request);
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "logs:list");
  if (limited) {
    return limited;
  }

  try {
    const [syncLogs, automationRuns, auditLogs] = await Promise.all([
      prisma.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 100 }),
      prisma.automationRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
    ]);

    return ok({ syncLogs, automationRuns, auditLogs });
  } catch (error) {
    return handleApiError(error);
  }
}

