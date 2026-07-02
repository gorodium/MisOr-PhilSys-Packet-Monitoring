import { RunStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, ok } from "@/lib/api";
import { dryRunAutomation } from "@/lib/automation";
import { getRequestActor, requireAdmin } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const dryRunSchema = z.object({
  packetIds: z.array(z.string()).optional(),
  recheck: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  const forbidden = requireAdmin(request);
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "automation:dry-run");
  if (limited) {
    return limited;
  }

  const actor = getRequestActor(request);

  try {
    const body = dryRunSchema.parse(await request.json().catch(() => ({})));
    const result = await dryRunAutomation(body);
    await writeAuditLog({
      action: "AUTOMATION_DRY_RUN",
      actor,
      status: RunStatus.SUCCESS,
      message: "Automation dry run completed.",
      metadata: { candidateCount: result.candidates.length }
    });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

