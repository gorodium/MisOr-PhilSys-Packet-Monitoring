import { NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const forbidden = await requireAdminApi();
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "logs:list");
  if (limited) {
    return limited;
  }

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = 50;
    
    const where = type && type !== "ALL" ? { type } : {};

    const [activities, totalCount] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.activityLog.count({ where })
    ]);

    return ok({ activities, totalCount, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

