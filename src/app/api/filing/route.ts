import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const filingSchema = z.object({
  trn: z.string().length(29),
  actionType: z.string(),
  remarks: z.string().min(1),
  firstName: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  birthday: z.string().nullable().optional() // yyyy-mm-dd
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = filingSchema.parse(body);

    // Check if TRN is already filed
    const existingReq = await prisma.matrixFilingRequest.findFirst({
      where: { trn: data.trn }
    });

    if (existingReq) {
      return fail(`This TRN (${data.trn}) has already been filed in the system.`, 400);
    }

    // Check if TRN already exists in Matrix directly
    try {
      const { createMatrixAdapter } = await import("@/lib/matrix/adapter");
      const adapter = await createMatrixAdapter();
      const existingTickets = await adapter.searchTicketsByPacket(data.trn);
      
      if (existingTickets && existingTickets.length > 0) {
        return fail(`This TRN (${data.trn}) already exists in Matrix (Ticket #${existingTickets[0].ticketNumber}).`, 400);
      }
    } catch (err) {
      console.warn("Failed to check Matrix for existing tickets, proceeding anyway...", err);
    }

    // Save to DB
    const req = await prisma.matrixFilingRequest.create({
      data: {
        trn: data.trn,
        actionType: data.actionType,
        remarks: data.remarks,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        sex: data.sex,
        birthday: data.birthday ? new Date(data.birthday) : null,
        status: "PENDING"
      }
    });

    return ok({ id: req.id, status: "PENDING", message: "Saved to DB. Matrix ticket must be filed manually." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const requests = await prisma.matrixFilingRequest.findMany({
      orderBy: { createdAt: "desc" }
    });
    return ok(requests);
  } catch (error) {
    return handleApiError(error);
  }
}

