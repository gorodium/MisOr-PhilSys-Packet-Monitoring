import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

import { verifySession } from "@/lib/auth";

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
    const session = await verifySession();
    if (!session) return fail("Unauthorized", 401);

    const body = await request.json();
    const data = filingSchema.parse(body);

    const existingReq = await prisma.matrixFilingRequest.findFirst({
      where: { trn: data.trn }
    });

    if (existingReq) {
      return fail(`This TRN (${data.trn}) has already been filed in the system.`, 400);
    }

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
        status: "PENDING",
        userId: session.userId
      }
    });

    return ok({ id: req.id, status: "PENDING", message: "Saved to DB. Matrix ticket must be filed manually." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) return fail("Unauthorized", 401);

    const where = session.role === "ADMIN" ? {} : { userId: session.userId };

    const requests = await prisma.matrixFilingRequest.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });
    return ok(requests);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) return fail("Unauthorized", 401);

    const body = await request.json();
    const { id, ...updateData } = body;
    
    if (!id) return fail("Filing request ID is required", 400);
    
    const existingReq = await prisma.matrixFilingRequest.findUnique({
      where: { id }
    });
    
    if (!existingReq) return fail("Request not found", 404);
    
    // Only admins or the owner can edit
    if (session.role !== "ADMIN" && existingReq.userId !== session.userId) {
      return fail("Forbidden", 403);
    }
    
    if (existingReq.status !== "PENDING" && session.role !== "ADMIN") {
      return fail("Only pending requests can be edited", 400);
    }
    
    // Clean data before update
    const safeData = filingSchema.omit({ trn: true }).partial().parse(updateData);
    
    const req = await prisma.matrixFilingRequest.update({
      where: { id },
      data: {
        ...safeData,
        birthday: safeData.birthday ? new Date(safeData.birthday) : undefined,
      }
    });
    
    return ok(req);
  } catch (error) {
    return handleApiError(error);
  }
}
