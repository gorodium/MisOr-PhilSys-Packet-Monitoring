import { RunStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api";
import { getRequestActor, requireAdmin } from "@/lib/auth";
import { runFullSync } from "@/lib/matching";
import { assertRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const forbidden = requireAdmin(request);
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "sync:full");
  if (limited) {
    return limited;
  }

  const actor = getRequestActor(request);

  try {
    const result = await runFullSync();
    await writeAuditLog({
      action: "MANUAL_FULL_SYNC",
      actor,
      status: RunStatus.SUCCESS,
      message: "Manual full sync completed.",
      metadata: result
    });
    return ok(result);
  } catch (error) {
    await writeAuditLog({
      action: "MANUAL_FULL_SYNC",
      actor,
      status: RunStatus.ERROR,
      message: error instanceof Error ? error.message : "Manual full sync failed."
    });
    return handleApiError(error);
  }
}

