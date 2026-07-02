import { RunStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createTicketsForPackets } from "@/lib/automation";
import { handleApiError, ok } from "@/lib/api";
import { getRequestActor, requireAdmin } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const createTicketsSchema = z.object({
  packetIds: z.array(z.string()).min(1),
  confirmed: z.boolean()
});

export async function POST(request: NextRequest) {
  const forbidden = requireAdmin(request);
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "automation:create-tickets");
  if (limited) {
    return limited;
  }

  const actor = getRequestActor(request);

  try {
    const body = createTicketsSchema.parse(await request.json());
    const result = await createTicketsForPackets(body);
    await writeAuditLog({
      action: "TICKET_CREATION",
      actor,
      status: result.errors.length ? RunStatus.PARTIAL : RunStatus.SUCCESS,
      message: "Ticket creation request completed.",
      metadata: result
    });
    return ok(result);
  } catch (error) {
    await writeAuditLog({
      action: "TICKET_CREATION",
      actor,
      status: RunStatus.ERROR,
      message: error instanceof Error ? error.message : "Ticket creation failed."
    });
    return handleApiError(error);
  }
}

