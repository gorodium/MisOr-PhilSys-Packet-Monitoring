import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const matrixFilingSchema = z.object({
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

// A fallback map for category IDs since the Matrix API returns 403 Forbidden for /issue_categories.json
// These were scraped from existing tickets.
const KNOWN_CATEGORY_IDS: Record<string, number> = {
  "NO PSN": 562,
  "With PSN": 563,
  "Regclient Issue": 580,
  "No QR and Photo": 600,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = matrixFilingSchema.parse(body);

    const existingReq = await prisma.matrixFilingRequest.findUnique({
      where: { id }
    });

    if (!existingReq) {
      return fail("Filing request not found", 404);
    }

    if (existingReq.status === "FILED" && existingReq.matrixTicketId) {
      return fail("This request is already filed in Matrix.", 400);
    }

    try {
      const { createMatrixAdapter } = await import("@/lib/matrix/adapter");
      const adapter = await createMatrixAdapter();
      
      const resolvedCategoryId = data.categoryName ? KNOWN_CATEGORY_IDS[data.categoryName] : undefined;
      
      const ticket = await adapter.createTicketForPacket({
        packet: { 
          id: existingReq.id, 
          normalizedPacketCode: existingReq.trn,
          issueCategory: "Manual Filing",
          sourceSheetRowNumber: 0
        },
        title: data.title,
        body: data.body,
        trackerId: data.trackerId,
        statusId: data.statusId,
        priorityId: data.priorityId,
        assigneeId: data.assigneeId,
        categoryId: resolvedCategoryId,
        startDate: data.startDate,
        dueDate: data.dueDate
      });

      await prisma.matrixFilingRequest.update({
        where: { id },
        data: {
          status: "FILED",
          matrixTicketId: ticket.matrixTicketId
        }
      });
      
      return ok({ id, status: "FILED", ticketNumber: ticket.ticketNumber });
    } catch (err) {
      console.error("Failed to create Matrix ticket:", err);
      await prisma.matrixFilingRequest.update({
        where: { id },
        data: { status: "ERROR" }
      });
      return fail("Failed to create Matrix ticket. Ensure API configurations are correct.", 500);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
