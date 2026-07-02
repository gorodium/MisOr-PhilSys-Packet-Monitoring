import { NextRequest } from "next/server";
import { fail, handleApiError, ok } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limited = assertRateLimit(request, "packets:detail");
  if (limited) {
    return limited;
  }

  try {
    const params = await context.params;
    const packet = await prisma.packet.findUnique({
      where: { id: params.id },
      include: {
        matrixTicket: true,
        matches: {
          include: {
            matrixTicket: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!packet) {
      return fail("Packet was not found.", 404);
    }

    const syncHistory = await prisma.syncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 20
    });

    return ok({
      packet: {
        ...packet,
        statusLabel: STATUS_LABELS[packet.syncStatus]
      },
      syncHistory
    });
  } catch (error) {
    return handleApiError(error);
  }
}
