import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  packetId: z.string(),
  trackerId: z.number().optional(),
  title: z.string(),
  body: z.string(),
  statusId: z.number().optional(),
  priorityId: z.number().optional(),
  assigneeId: z.number().optional(),
  categoryName: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

const KNOWN_CATEGORY_IDS: Record<string, number> = {
  "NO PSN": 562,
  "With PSN": 563,
  "Regclient Issue": 580,
  "No QR and Photo": 600,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);

    const packet = await prisma.packet.findUnique({ where: { id: data.packetId } });
    if (!packet) return fail("Packet not found", 404);

    const { createMatrixAdapter } = await import("@/lib/matrix/adapter");
    const adapter = await createMatrixAdapter();

    const resolvedCategoryId = data.categoryName ? KNOWN_CATEGORY_IDS[data.categoryName] : undefined;

    const ticket = await adapter.createTicketForPacket({
      packet: {
        id: packet.id,
        normalizedPacketCode: packet.normalizedPacketCode,
        issueCategory: packet.issueCategory || "Manual Filing",
        sourceSheetRowNumber: packet.sourceSheetRowNumber,
      },
      title: data.title,
      body: data.body,
      trackerId: data.trackerId,
      statusId: data.statusId,
      priorityId: data.priorityId,
      assigneeId: data.assigneeId,
      categoryId: resolvedCategoryId,
      startDate: data.startDate,
      dueDate: data.dueDate,
    });

    return ok({ ticketNumber: ticket.ticketNumber, matrixTicketId: ticket.matrixTicketId });
  } catch (error) {
    return handleApiError(error);
  }
}
