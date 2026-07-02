import { RunStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { runAutomation } from "@/lib/automation";
import { handleApiError, ok } from "@/lib/api";
import { getRequestActor, requireAdmin } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const runSchema = z.object({
  mode: z.enum(["manual", "auto"]).default("manual")
});

export async function POST(request: NextRequest) {
  const forbidden = requireAdmin(request);
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "automation:run");
  if (limited) {
    return limited;
  }

  const actor = getRequestActor(request);

  try {
    const body = runSchema.parse(await request.json().catch(() => ({})));
    const result = await runAutomation({ mode: body.mode });
    await writeAuditLog({
      action: body.mode === "auto" ? "AUTO_SYNC" : "MANUAL_AUTOMATION_RUN",
      actor,
      status: RunStatus.SUCCESS,
      message: "Automation run completed.",
      metadata: result
    });
    return ok(result);
  } catch (error) {
    await writeAuditLog({
      action: "MANUAL_AUTOMATION_RUN",
      actor,
      status: RunStatus.ERROR,
      message: error instanceof Error ? error.message : "Automation run failed."
    });
    return handleApiError(error);
  }
}

